package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// promptSpec is everything the model call needs. Only this file builds one.
type promptSpec struct {
	Prompt      string
	Temperature float64
	MaxTokens   int
	JSON        bool
}

// task turns one typed request into a prompt. check, when set, validates the
// model's JSON before it reaches the browser.
type task struct {
	build func(dec *json.Decoder, d *dictionary) (promptSpec, error)
	check func(raw json.RawMessage) error
}

var tasks = map[string]task{
	"rank-ragas":        {build: buildRankRagas, check: checkRankResult},
	"raga-lookup":       {build: buildRagaLookup, check: checkLookupResult},
	"practice-feedback": {build: buildPracticeFeedback},
	"lesson-feedback":   {build: buildLessonFeedback},
}

const maxOutputTokens = 1400

func decodeOne(dec *json.Decoder, v any) error {
	if err := dec.Decode(v); err != nil {
		return err
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		return errors.New("unexpected data after request body")
	}
	return nil
}

// fill replaces {{name}} placeholders in one pass, so text inserted for one
// placeholder is never scanned for another.
func fill(tmpl string, vars map[string]string) string {
	pairs := make([]string, 0, 2*len(vars))
	for k, v := range vars {
		pairs = append(pairs, "{{"+k+"}}", v)
	}
	return strings.NewReplacer(pairs...).Replace(tmpl)
}

// ── rank-ragas ──────────────────────────────────────────────────────────────
// Gemini ranks the shortlist the browser's deterministic scorer produced.

type candidate struct {
	Name          string  `json:"name"`
	MatchCount    int     `json:"matchCount"`
	AlienCount    int     `json:"alienCount"`
	PhraseMatches int     `json:"phraseMatches"`
	Score         float64 `json:"score"`
}

type rankRequest struct {
	Notes      []noteEvent `json:"notes"`
	Candidates []candidate `json:"candidates"`
}

func buildRankRagas(dec *json.Decoder, d *dictionary) (promptSpec, error) {
	var req rankRequest
	if err := decodeOne(dec, &req); err != nil {
		return promptSpec{}, err
	}
	if err := checkNoteEvents(req.Notes); err != nil {
		return promptSpec{}, err
	}
	if len(req.Candidates) > 10 {
		return promptSpec{}, badf("Too many candidates.")
	}
	for _, c := range req.Candidates {
		if _, ok := d.lookup(c.Name); !ok {
			return promptSpec{}, badf("Unknown raga %q.", c.Name)
		}
		for _, n := range []int{c.MatchCount, c.AlienCount, c.PhraseMatches} {
			if n < 0 || n > 64 {
				return promptSpec{}, badf("Candidate counts are out of range.")
			}
		}
		if err := checkNumber("score", c.Score, -1000, 1000); err != nil {
			return promptSpec{}, err
		}
	}

	localHint := ""
	if len(req.Candidates) > 0 {
		lines := []string{}
		for i, c := range req.Candidates[:min(5, len(req.Candidates))] {
			phrase := ""
			if c.PhraseMatches > 0 {
				phrase = fmt.Sprintf(", %d signature phrase(s) matched", c.PhraseMatches)
			}
			lines = append(lines, fmt.Sprintf("%d. %s — %d scale notes matched, %d alien%s, local score %s",
				i+1, c.Name, c.MatchCount, c.AlienCount, phrase, strconv.FormatFloat(c.Score, 'f', 1, 64)))
		}
		localHint = "\nLOCAL PATTERN ANALYSIS — pre-scored from deterministic note-set + phrase matching.\n" +
			"Treat this as a strong prior. Your job is to RANK these candidates using the swara evidence, " +
			"not to generate a fresh list from scratch. Override only if the swara evidence clearly contradicts.\n" +
			strings.Join(lines, "\n") + "\n"
	}

	dictLines := make([]string, len(d.ragas))
	for i, r := range d.ragas {
		dictLines[i] = fmt.Sprintf("%s | Arohanam: %s | Avarohanam: %s",
			r.Name, strings.Join(r.Arohanam, " "), strings.Join(r.Avarohanam, " "))
	}

	return promptSpec{
		Prompt: fill(rankPrompt, map[string]string{
			"evidence":   buildSwaraEvidence(req.Notes),
			"local_hint": localHint,
			"dictionary": strings.Join(dictLines, "\n"),
		}),
		Temperature: 0.1,
		MaxTokens:   maxOutputTokens,
		JSON:        true,
	}, nil
}

func checkRankResult(raw json.RawMessage) error {
	var out struct {
		TopMatches []struct {
			Raagam string `json:"raagam"`
		} `json:"top_matches"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return err
	}
	if len(out.TopMatches) == 0 {
		return errors.New("no top_matches")
	}
	for _, m := range out.TopMatches {
		if m.Raagam == "" {
			return errors.New("match without a raagam name")
		}
	}
	return nil
}

const rankPrompt = `You are an expert Carnatic classical musician and musicologist with deep knowledge of gamakam ornamentation.

CRITICAL CONTEXT — GAMAKAM SINGING:
This transcription is from a live vocal performance that may include Carnatic gamakams (pitch ornaments). When a singer performs gamakams, the voice slides through intermediate semitones — these appear as brief "transitional" notes between the true target swaras. These transitional pitches are NOT separate scale notes and must NOT be treated as alien notes.

Example: A singer performing Ma2 with gamakam will slide through Ma1 on the way up. Ma1 will appear in the transcription even though the raga uses Ma2. Always trust the NOTE FREQUENCY SUMMARY over the raw sequence when they conflict.

HOW TO IDENTIFY CORRECTLY:
1. The NOTE FREQUENCY SUMMARY is your primary evidence. High-frequency notes that also appear as (long) are TRUE scale swaras. Low-frequency notes with no long occurrences are gamakam artifacts.
2. Madhyama and Dhaivatam are branch-point decisions — identify them from the most frequent and longest notes FIRST.
   — Ma1 (suddha madhyama) = semitone 5 | Ma2 (prati madhyama) = semitone 6
   — Da1 (suddha dhaivatam) = semitone 8 | Da2 (chathusruti dhaivatam) = semitone 9
3. Do NOT count a low-frequency note as an "alien note" if it sits one semitone away from a high-frequency note — it is almost certainly a slide artifact.
4. Notes marked (long) or (very long) are established swaras. Plain notes may be passing tones.
5. ASCENT / DESCENT ASYMMETRY: Many Carnatic janyas omit notes in ascent that appear in descent. A note appearing only rarely suggests it is avarohanam-only. Treat omissions in arohanam as POSITIVE evidence for the janya, not absence of information.
6. PHRASE GRAMMAR over note inventory: Look for characteristic movement contours — the order and direction of notes matters more than whether all scale degrees appear. A janya whose movement pattern fits should beat a melakarta that merely contains all the detected notes.
7. STRUCTURAL vs. ORNAMENTAL: Only frequently repeated notes and (long)/(very long) notes are structurally identity-bearing. Rare notes are ornamental or transitional.

Transcribed swara sequence:
{{evidence}}
{{local_hint}}
Reference Raga Dictionary:
{{dictionary}}

Using the reference dictionary as your strict baseline, identify the Top 3 most likely Carnatic raagams. Determine the correct madhyama from the prominent/long notes before comparing against the full scale.

CRITICAL INSTRUCTIONS:
- If the sequence matches a specific Janya raga's MOVEMENT PATTERN (arohanam/avarohanam shape, omitted notes, characteristic phrases), you MUST prefer that Janya over the parent Melakarta, even if the parent technically contains all the detected notes.
- When two ragas are close, explicitly check: which Dhaivatam is dominant? Which Ni is dominant? Which Ma is used? These are branch points, not tie-breakers.
- Absence of a note in arohanam (e.g., no Ri in the ascending phrase) is POSITIVE evidence for a janya that structurally omits that note.

Respond ONLY with valid JSON exactly matching this format:
{
  "top_matches": [
    {
      "raagam": "<Name>",
      "family": "<Parent melakarta name, or same as raagam if it IS the melakarta>",
      "arohanam": "<ascending scale>",
      "avarohanam": "<descending scale>",
      "confidence": "<high, medium, or low>",
      "prayogams": ["<phrase 1>", "<phrase 2>"],
      "reasoning": "<Why this sequence matches this raagam, including ascent/descent analysis and key omissions>"
    },
    ... (provide exactly 3 matches)
  ]
}`

// ── raga-lookup ─────────────────────────────────────────────────────────────
// Describe a raga the library doesn't have, grounded in the verified scales.

type lookupRequest struct {
	RagaName string `json:"ragaName"`
}

func buildRagaLookup(dec *json.Decoder, d *dictionary) (promptSpec, error) {
	var req lookupRequest
	if err := decodeOne(dec, &req); err != nil {
		return promptSpec{}, err
	}
	name := strings.TrimSpace(req.RagaName)
	if err := checkRagaName(name); err != nil {
		return promptSpec{}, err
	}

	ref := make([]string, len(d.ragas))
	for i, r := range d.ragas {
		ref[i] = fmt.Sprintf("%s: Arohanam=[%s] Avarohanam=[%s] Parent=%s",
			r.Name, strings.Join(r.Arohanam, ", "), strings.Join(r.Avarohanam, ", "), r.Type)
	}
	return promptSpec{
		Prompt:      fill(lookupPrompt, map[string]string{"name": name, "reference": strings.Join(ref, "\n")}),
		Temperature: 0.1,
		MaxTokens:   maxOutputTokens,
		JSON:        true,
	}, nil
}

func checkLookupResult(raw json.RawMessage) error {
	var out struct {
		Error    string   `json:"error"`
		Name     string   `json:"name"`
		Arohanam []string `json:"arohanam"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return err
	}
	if out.Error == "" && (out.Name == "" || len(out.Arohanam) == 0) {
		return errors.New("lookup result has neither an error nor a scale")
	}
	return nil
}

const lookupPrompt = `You are an expert Carnatic classical musician and musicologist.
The user is asking about: "{{name}}".

VERIFIED RAGA DATABASE (these scales are 100% correct — use them as ground truth):
{{reference}}

INSTRUCTIONS:
1. If "{{name}}" exactly matches a raga in the database above, copy its arohanam and avarohanam VERBATIM. Do not alter a single note.
2. If "{{name}}" is clearly a janya or variant of a raga in the database (e.g. a graha bhedam, murchana, or alternate spelling), derive the scale mathematically from the parent. Explain the relationship in "description".
3. If "{{name}}" is NOT a real Carnatic raga at all, return only: { "error": "<explanation>" }
4. NEVER invent compositions. Only include compositions you are certain about for THIS specific raga. If unsure, return an empty array.
5. Use standard swara notation: Sa, Ri1, Ri2, Ri3, Ga1, Ga2, Ga3, Ma1, Ma2, Pa, Da1, Da2, Da3, Ni1, Ni2, Ni3.

Respond ONLY with valid JSON:
{
  "name": "<correctly spelled raga name>",
  "parent": "<parent melakarta name and number>",
  "arohanam": ["Sa", ...],
  "avarohanam": ["Sa", ...],
  "mood": "<1-3 words>",
  "description": "<2-3 sentences about character, history, and feeling — mention if this is a graha bhedam/variant>",
  "compositions": ["<only compositions you are 100% certain belong to this raga>"]
}`

// ── practice-feedback ───────────────────────────────────────────────────────
// Raga Practice: the browser measures pitch, resonance, breath and gamakas;
// the model only turns those measurements into a teacher's words.

type noteStats struct {
	Note        string  `json:"note"`
	AvgDevCents float64 `json:"avgDevCents"`
	StdDevCents float64 `json:"stdDevCents"`
}

type alignedNote struct {
	Note string `json:"note"`
	Hit  bool   `json:"hit"`
}

type ornament struct {
	Note string  `json:"note"`
	Hz   float64 `json:"hz"`
}

type practiceRequest struct {
	Raga struct {
		Name       string   `json:"name"`
		Arohanam   []string `json:"arohanam"`
		Avarohanam []string `json:"avarohanam"`
	} `json:"raga"`
	ArohanamResult   []alignedNote `json:"arohanamResult"`
	AvarohanamResult []alignedNote `json:"avarohanamResult"`
	Intonation       []noteStats   `json:"intonation"`
	HarmonicRichness float64       `json:"harmonicRichness"`
	Breath           string        `json:"breath"`
	Ornaments        []ornament    `json:"ornaments"`
}

var breathLabels = map[string]string{
	"steady":       "steady and well-supported throughout",
	"fading":       "fading — voice dropped toward the end, likely breath support issue",
	"inconsistent": "slightly inconsistent — some volume fluctuation detected",
	"unknown":      "not enough audio to judge",
}

func checkStats(field string, stats []noteStats) error {
	if len(stats) > 32 {
		return badf("Too many notes in %s.", field)
	}
	for _, s := range stats {
		if !notationPattern.MatchString(s.Note) {
			return badf("Invalid note in %s.", field)
		}
		if err := checkNumber("avgDevCents", s.AvgDevCents, -2400, 2400); err != nil {
			return err
		}
		if err := checkNumber("stdDevCents", s.StdDevCents, 0, 2400); err != nil {
			return err
		}
	}
	return nil
}

func checkAligned(field string, notes []alignedNote) error {
	if len(notes) > 32 {
		return badf("Too many notes in %s.", field)
	}
	for _, n := range notes {
		if !notationPattern.MatchString(n.Note) {
			return badf("Invalid note in %s.", field)
		}
	}
	return nil
}

func (r *practiceRequest) validate() error {
	if err := checkRagaName(r.Raga.Name); err != nil {
		return err
	}
	if err := checkTokens("arohanam", r.Raga.Arohanam, 24); err != nil {
		return err
	}
	if err := checkTokens("avarohanam", r.Raga.Avarohanam, 24); err != nil {
		return err
	}
	if err := checkAligned("arohanamResult", r.ArohanamResult); err != nil {
		return err
	}
	if err := checkAligned("avarohanamResult", r.AvarohanamResult); err != nil {
		return err
	}
	if err := checkStats("intonation", r.Intonation); err != nil {
		return err
	}
	if err := checkNumber("harmonicRichness", r.HarmonicRichness, 0, 1); err != nil {
		return err
	}
	if _, ok := breathLabels[r.Breath]; !ok {
		return badf("Invalid breath label.")
	}
	if len(r.Ornaments) > 24 {
		return badf("Too many ornaments.")
	}
	for _, o := range r.Ornaments {
		if !notationPattern.MatchString(o.Note) {
			return badf("Invalid ornament note.")
		}
		if err := checkNumber("ornament hz", o.Hz, 0, 50); err != nil {
			return err
		}
	}
	return nil
}

func tuningWord(avg int) string {
	switch {
	case avg >= -15 && avg <= 15:
		return "in tune"
	case avg > 0:
		return "sharp"
	default:
		return "flat"
	}
}

func signed(n int) string {
	if n >= 0 {
		return "+" + strconv.Itoa(n)
	}
	return strconv.Itoa(n)
}

func formatAlignment(notes []alignedNote, intonation map[string]noteStats) string {
	lines := make([]string, len(notes))
	for i, n := range notes {
		s, measured := intonation[n.Note]
		switch {
		case !n.Hit:
			lines[i] = fmt.Sprintf("- %s: ✗ missed", n.Note)
		case !measured:
			lines[i] = fmt.Sprintf("- %s: ✓ hit", n.Note)
		default:
			avg := jsRound(s.AvgDevCents)
			stability := "unstable"
			if s.StdDevCents < 15 {
				stability = "stable"
			} else if s.StdDevCents < 35 {
				stability = "slightly wavering"
			}
			lines[i] = fmt.Sprintf("- %s: ✓ hit · %s¢ (%s) · %s", n.Note, signed(avg), tuningWord(avg), stability)
		}
	}
	return strings.Join(lines, "\n")
}

func buildPracticeFeedback(dec *json.Decoder, d *dictionary) (promptSpec, error) {
	var req practiceRequest
	if err := decodeOne(dec, &req); err != nil {
		return promptSpec{}, err
	}
	if err := req.validate(); err != nil {
		return promptSpec{}, err
	}

	// Trust the verified scale over the client's copy when the raga is known.
	aro, ava, character := req.Raga.Arohanam, req.Raga.Avarohanam, ""
	if known, ok := d.lookup(req.Raga.Name); ok {
		aro, ava = known.Arohanam, known.Avarohanam
		if known.Description != "" {
			character = "Character: " + known.Description
		}
	}

	intonation := make(map[string]noteStats, len(req.Intonation))
	for _, s := range req.Intonation {
		intonation[s.Note] = s
	}

	resonance := "thin or constricted — voice may be tight"
	if req.HarmonicRichness > 0.55 {
		resonance = "resonant and open"
	} else if req.HarmonicRichness > 0.35 {
		resonance = "moderately resonant"
	}

	ornamentLabel := "No clear ornamentation detected"
	if len(req.Ornaments) > 0 {
		found := make([]string, len(req.Ornaments))
		for i, o := range req.Ornaments {
			found[i] = fmt.Sprintf("%s (%s Hz)", o.Note, strconv.FormatFloat(o.Hz, 'f', 1, 64))
		}
		ornamentLabel = "Oscillation detected on: " + strings.Join(found, ", ") + " — possible kampita gamakam"
	}

	return promptSpec{
		Prompt: fill(practicePrompt, map[string]string{
			"raga":       req.Raga.Name,
			"arohanam":   strings.Join(aro, " "),
			"avarohanam": strings.Join(ava, " "),
			"character":  character,
			"aro_result": formatAlignment(req.ArohanamResult, intonation),
			"ava_result": formatAlignment(req.AvarohanamResult, intonation),
			"resonance":  resonance,
			"harmonic":   strconv.FormatFloat(req.HarmonicRichness*100, 'f', 0, 64),
			"breath":     breathLabels[req.Breath],
			"ornaments":  ornamentLabel,
		}),
		Temperature: 0.65,
		MaxTokens:   maxOutputTokens,
	}, nil
}

const practicePrompt = `You are an expert classical Carnatic vocal teacher evaluating a student who already has a foundation and is now deepening their practice of the raga {{raga}}.

RAGA: {{raga}}
Arohanam: {{arohanam}}
Avarohanam: {{avarohanam}}
{{character}}

AROHANAM ACCURACY:
{{aro_result}}

AVAROHANAM ACCURACY:
{{ava_result}}

VOICE QUALITY:
- Resonance: {{resonance}} (harmonic richness: {{harmonic}}%)
- Breath Support: {{breath}}
- Ornamentation: {{ornaments}}

Respond in plain prose — exactly 3 short paragraphs, max 200 words total. Do NOT use JSON, bullet points, or headers.
1. Note accuracy — which notes they nailed, which were consistently flat or sharp, which they missed. Be specific.
2. Voice quality — address the resonance and breath support using proper Carnatic terms (akaram, gamakam, shruti, swarasthana). If ornamentation was detected, comment on whether it was clean.
3. One precise, actionable tip for their next practice session.

Tone: warm but direct. Address them as a serious student. Do not mention numbers or cents.`

// ── lesson-feedback ─────────────────────────────────────────────────────────
// Gurukul "Sing for AI Feedback": compare what was sung with the exercise.

type lessonRequest struct {
	Style         string      `json:"style"`
	LessonTitle   string      `json:"lessonTitle"`
	ExerciseTitle string      `json:"exerciseTitle"`
	Instruction   string      `json:"instruction"`
	Expected      []string    `json:"expected"`
	Detected      []string    `json:"detected"`
	Stats         []noteStats `json:"stats"`
	SaHz          float64     `json:"saHz"`
}

func (r *lessonRequest) validate() error {
	if r.Style != "classic" && r.Style != "young" {
		return badf("Invalid guru style.")
	}
	// The longest curriculum exercise has 230 notes.
	if err := checkTokens("expected", r.Expected, 256); err != nil {
		return err
	}
	if err := checkTokens("detected", r.Detected, 512); err != nil {
		return err
	}
	if err := checkStats("stats", r.Stats); err != nil {
		return err
	}
	return checkNumber("saHz", r.SaHz, 50, 1000)
}

// practiceType names what the exercise drills. Avarohanam is checked before
// arohanam because "avarohanam" contains "arohanam".
func practiceType(title, instruction string, expected []string) string {
	t, in := strings.ToLower(title), strings.ToLower(instruction)
	mentions := func(words ...string) bool {
		for _, w := range words {
			if strings.Contains(t, w) || strings.Contains(in, w) {
				return true
			}
		}
		return false
	}
	switch {
	case mentions("avarohanam", "descending"):
		return "Avarohanam (Descending Practice)"
	case mentions("arohanam", "ascending"):
		return "Arohanam (Ascending Practice)"
	case len(expected) > 1:
		return "Melodic Sequence"
	case len(expected) == 1:
		return "Sustaining Swara: " + expected[0]
	default:
		return "Sustained Pitch"
	}
}

func buildLessonFeedback(dec *json.Decoder, _ *dictionary) (promptSpec, error) {
	var req lessonRequest
	if err := decodeOne(dec, &req); err != nil {
		return promptSpec{}, err
	}
	if err := req.validate(); err != nil {
		return promptSpec{}, err
	}

	lessonTitle := cleanLine(req.LessonTitle, 120)
	exerciseTitle := cleanLine(req.ExerciseTitle, 120)
	instruction := cleanLine(req.Instruction, 300)

	typeTitle := exerciseTitle
	if typeTitle == "" {
		typeTitle = lessonTitle
	}
	expected := "Sustain Sa / Hmmm"
	if len(req.Expected) > 0 {
		expected = strings.Join(req.Expected, " - ")
	}
	detected := strings.Join(req.Detected, " - ")
	if detected == "" {
		detected = "No distinct swaras detected"
	}
	if exerciseTitle == "" {
		exerciseTitle = "Sing Along"
	}
	if instruction == "" {
		instruction = "Sustain the pitches correctly"
	}

	stats := make([]string, len(req.Stats))
	for i, s := range req.Stats {
		avg := jsRound(s.AvgDevCents)
		stability := "wavering"
		if s.StdDevCents < 15 {
			stability = "highly stable"
		} else if s.StdDevCents < 35 {
			stability = "moderate stability"
		}
		stats[i] = fmt.Sprintf("- Swara: %s | Cents Deviation: %s cents (%s) | Pitch Stability: %s",
			s.Note, signed(avg), tuningWord(avg), stability)
	}

	tmpl := classicGuruPrompt
	if req.Style == "young" {
		tmpl = youngGuruPrompt
	}
	return promptSpec{
		Prompt: fill(tmpl, map[string]string{
			"lesson":        lessonTitle,
			"exercise":      exerciseTitle,
			"instruction":   instruction,
			"practice_type": practiceType(typeTitle, req.Instruction, req.Expected),
			"expected":      expected,
			"sa":            strconv.FormatFloat(req.SaHz, 'f', -1, 64),
			"detected":      detected,
			"stats":         strings.Join(stats, "\n"),
		}),
		Temperature: 0.7,
		MaxTokens:   maxOutputTokens,
	}, nil
}

const classicGuruPrompt = `You are an expert classical Carnatic vocal coach (guru).
The student is practicing a lesson in their foundational curriculum.

LESSON CONTEXT:
- Lesson Title: "{{lesson}}"
- Current Exercise: "{{exercise}}"
- Objective/Instruction: "{{instruction}}"
- Exercise Practice Type: {{practice_type}}
- Expected Target Swara Sequence to Sing: {{expected}}
- Student's Base Sa Frequency: {{sa}} Hz

STUDENT PERFORMANCE DATA DETECTED (8-second window):
- Chronological Swaras Actually Sang: "{{detected}}"
- Detailed Swara Statistics:
{{stats}}

CRITICAL INSTRUCTIONS FOR GURU:
1. Speak with the voice of a warm, wise, kind, and precise Carnatic guru. Greet the student briefly with a warm blessing (e.g., "Namaste, my dear student").
2. Balance warmth and length. Keep the response moderately concise (between 120 and 180 words, 3 short paragraphs maximum). Avoid long boilerplate lists of generic advice, but do not be dry or overly brief.
3. Compare what they actually sang with what they were expected to sing. Use classical terms naturally like "Shruti alignment", "Swarasthana accuracy", "Arohanam progression", "Avarohanam descent", or "Akaram resonance".
4. Highlight 1 key vocal strength (e.g., breath control, stable Sa foundation, or natural resonance).
5. Highlight 1 clear vocal correction needed (e.g., slight sharp or flat drifts, sequence order mismatch, or pitch stability waver).
6. Give 1 highly actionable classical vocal tip (e.g., visual pitch onset mapping, abdominal breathing, or anchoring ears to the Tambura drone). Do NOT mention cents or numbers in your final feedback.`

const youngGuruPrompt = `You are an expert Carnatic vocal coach (guru) speaking to a child (12 years or younger) or an absolute beginner.
The student is practicing a lesson in their foundational curriculum.

LESSON CONTEXT:
- Lesson Title: "{{lesson}}"
- Current Exercise: "{{exercise}}"
- Expected Target Swara Sequence to Sing: {{expected}}

STUDENT PERFORMANCE DATA DETECTED (8-second window):
- Chronological Swaras Actually Sang: "{{detected}}"

CRITICAL INSTRUCTIONS FOR GURU:
1. Speak with the voice of a very warm, loving, kind, and encouraging Carnatic guru, like a sweet, supportive grandparent or teacher.
2. Greet the student lovingly with a warm blessing (e.g., "Namaste, my dear child!").
3. Use extremely simple, friendly, and non-technical language. Do NOT use complex technical jargon like "Swarasthana accuracy", "Avarohanam descent", "cents deviation", or "Akaram resonance" without explaining them simply (e.g. call it "singing the notes on target" or "holding a steady voice").
4. Compare what they actually sang with the target sequence in a very clear, supportive, and simple way.
5. Highlight 1 simple thing they did great (e.g., "Your voice is so bright and sweet!" or "You hit that first Sa beautifully!").
6. Highlight 1 friendly little thing to practice with a playful, fun tip (e.g., "Try to hum like a little bee to make your voice super steady!" or "Imagine blowing out a tiny candle to support your breath!").
7. Keep it very warm and under 120 words (2 short paragraphs maximum). Do NOT mention cents, numbers, or technical stability ratings.`
