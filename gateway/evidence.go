package main

import (
	"fmt"
	"sort"
	"strings"
)

// noteEvent is one held note the browser detected: the swara relative to the
// singer's tonic, how long it was held, and whether it rose or fell from the
// previous note ("up", "down", "level", or empty when not tracked).
type noteEvent struct {
	Swara      string  `json:"swara"`
	DurationMs float64 `json:"durationMs"`
	Direction  string  `json:"direction,omitempty"`
}

const maxNoteEvents = 600

func checkNoteEvents(notes []noteEvent) error {
	if len(notes) < 2 {
		return badf("Not enough notes to analyse.")
	}
	if len(notes) > maxNoteEvents {
		return badf("Too many notes to analyse.")
	}
	for _, n := range notes {
		if !swaraNames[n.Swara] {
			return badf("Invalid swara %q.", n.Swara)
		}
		if err := checkNumber("durationMs", n.DurationMs, 0, 120_000); err != nil {
			return err
		}
		switch n.Direction {
		case "", "up", "down", "level":
		default:
			return badf("Invalid note direction.")
		}
	}
	return nil
}

type swaraCount struct {
	swara string
	count int
}

// countSwaras counts in first-seen order, then sorts most frequent first.
// The stable sort keeps first-seen order among ties, as the JS version did.
func countSwaras(swaras []string) []swaraCount {
	index := map[string]int{}
	var counts []swaraCount
	for _, s := range swaras {
		if i, ok := index[s]; ok {
			counts[i].count++
			continue
		}
		index[s] = len(counts)
		counts = append(counts, swaraCount{swara: s, count: 1})
	}
	sort.SliceStable(counts, func(i, j int) bool { return counts[i].count > counts[j].count })
	return counts
}

func formatCounts(counts []swaraCount) string {
	parts := make([]string, len(counts))
	for i, c := range counts {
		parts[i] = fmt.Sprintf("%s×%d", c.swara, c.count)
	}
	return strings.Join(parts, ", ")
}

// buildSwaraEvidence renders note events as the text summary the ranking
// prompt reads. It was buildSwaraString in Viveka.jsx; it moved here so the
// client sends data, not prompt text.
func buildSwaraEvidence(notes []noteEvent) string {
	seq := make([]string, len(notes))
	all := make([]string, len(notes))
	longCounts := map[string]int{}
	var ascent, descent []string
	contour := false

	for i, n := range notes {
		switch {
		case n.DurationMs > 1500:
			seq[i] = n.Swara + "(very long)"
		case n.DurationMs > 800:
			seq[i] = n.Swara + "(long)"
		default:
			seq[i] = n.Swara
		}
		all[i] = n.Swara
		if n.DurationMs > 800 {
			longCounts[n.Swara]++
		}
		switch n.Direction {
		case "up":
			ascent = append(ascent, n.Swara)
		case "down":
			descent = append(descent, n.Swara)
		}
		if n.Direction != "" {
			contour = true
		}
	}

	summary := make([]string, 0)
	for _, c := range countSwaras(all) {
		entry := fmt.Sprintf("%s×%d", c.swara, c.count)
		if longCounts[c.swara] > 0 {
			entry += fmt.Sprintf("(%d long)", longCounts[c.swara])
		}
		summary = append(summary, entry)
	}

	var b strings.Builder
	b.WriteString(strings.Join(seq, " "))
	b.WriteString("\n\nNOTE FREQUENCY SUMMARY (most→least frequent): ")
	b.WriteString(strings.Join(summary, ", "))
	if contour {
		b.WriteString("\nASCENT NOTES (approx): ")
		b.WriteString(orNA(formatCounts(countSwaras(ascent))))
		b.WriteString("\nDESCENT NOTES (approx): ")
		b.WriteString(orNA(formatCounts(countSwaras(descent))))
	}
	return b.String()
}

func orNA(s string) string {
	if s == "" {
		return "n/a"
	}
	return s
}
