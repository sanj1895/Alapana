package main

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"unicode"
)

// badRequest is a validation failure whose message is safe to show the user.
type badRequest string

func (e badRequest) Error() string { return string(e) }

func badf(format string, args ...any) error {
	return badRequest(fmt.Sprintf(format, args...))
}

// The 16 swarasthana names pitch detection maps notes to.
var swaraNames = toSet([]string{
	"Sa", "Ri1", "Ri2", "Ri3", "Ga1", "Ga2", "Ga3", "Ma1", "Ma2",
	"Pa", "Da1", "Da2", "Da3", "Ni1", "Ni2", "Ni3",
})

var (
	// A raga name: letters (any script), digits, spaces and light punctuation.
	// No double quotes or newlines, so a name cannot break out of its prompt line.
	ragaNamePattern = regexp.MustCompile(`^[\p{L}\p{M}0-9][\p{L}\p{M}0-9 '().\-]{0,59}$`)

	// A notation token from the curriculum: Sa, Ri2, Ni3., Sa^, Ṡ, or a bar
	// line or hold. Eight characters is too short to carry an instruction.
	notationPattern = regexp.MustCompile(`^[\p{L}\p{M}0-9.^|,\-]{1,8}$`)
)

func checkRagaName(name string) error {
	if !ragaNamePattern.MatchString(name) {
		return badf("Invalid raga name.")
	}
	return nil
}

func checkTokens(field string, tokens []string, maxLen int) error {
	if len(tokens) > maxLen {
		return badf("Too many notes in %s.", field)
	}
	for _, t := range tokens {
		if !notationPattern.MatchString(t) {
			return badf("Invalid note in %s.", field)
		}
	}
	return nil
}

func checkNumber(field string, x, lo, hi float64) error {
	if math.IsNaN(x) || math.IsInf(x, 0) || x < lo || x > hi {
		return badf("%s is out of range.", field)
	}
	return nil
}

// cleanLine reduces client-supplied display text (a lesson or exercise title)
// to one short line with no quotes, so it stays inside its quoted prompt field.
func cleanLine(s string, maxRunes int) string {
	var b strings.Builder
	space := false
	for _, r := range s {
		switch {
		case r == '"' || r == '`':
			continue
		case unicode.IsSpace(r) || unicode.IsControl(r):
			space = true
			continue
		}
		if space && b.Len() > 0 {
			b.WriteByte(' ')
		}
		space = false
		b.WriteRune(r)
	}
	out := []rune(b.String())
	if len(out) > maxRunes {
		out = out[:maxRunes]
	}
	return string(out)
}

// jsRound matches JavaScript's Math.round (halves round up), so numbers in
// prompts read the same as they did when the browser built them.
func jsRound(x float64) int {
	return int(math.Floor(x + 0.5))
}
