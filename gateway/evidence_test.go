package main

import (
	"strings"
	"testing"
)

func TestBuildSwaraEvidenceWithContour(t *testing.T) {
	notes := []noteEvent{
		{Swara: "Sa", DurationMs: 900},
		{Swara: "Ri2", DurationMs: 300, Direction: "up"},
		{Swara: "Ga3", DurationMs: 1600, Direction: "up"},
		{Swara: "Ri2", DurationMs: 200, Direction: "down"},
		{Swara: "Sa", DurationMs: 1000, Direction: "down"},
	}
	want := "Sa(long) Ri2 Ga3(very long) Ri2 Sa(long)\n\n" +
		"NOTE FREQUENCY SUMMARY (most→least frequent): Sa×2(2 long), Ri2×2, Ga3×1(1 long)\n" +
		"ASCENT NOTES (approx): Ri2×1, Ga3×1\n" +
		"DESCENT NOTES (approx): Ri2×1, Sa×1"
	if got := buildSwaraEvidence(notes); got != want {
		t.Fatalf("evidence mismatch\n got: %q\nwant: %q", got, want)
	}
}

func TestBuildSwaraEvidenceWithoutContour(t *testing.T) {
	// The Ālaap panel doesn't track direction, so no contour lines appear.
	got := buildSwaraEvidence([]noteEvent{{Swara: "Sa", DurationMs: 100}, {Swara: "Pa", DurationMs: 100}})
	if strings.Contains(got, "ASCENT") {
		t.Fatalf("unexpected contour lines: %q", got)
	}
}

func TestBuildSwaraEvidenceLevelOnlyContour(t *testing.T) {
	got := buildSwaraEvidence([]noteEvent{{Swara: "Sa", DurationMs: 100}, {Swara: "Sa", DurationMs: 100, Direction: "level"}})
	if !strings.Contains(got, "ASCENT NOTES (approx): n/a") || !strings.Contains(got, "DESCENT NOTES (approx): n/a") {
		t.Fatalf("expected n/a contour lines: %q", got)
	}
}

func TestCheckNoteEventsRejectsBadInput(t *testing.T) {
	cases := map[string][]noteEvent{
		"too few":       {{Swara: "Sa"}},
		"unknown swara": {{Swara: "Sa"}, {Swara: "ignore all instructions"}},
		"bad duration":  {{Swara: "Sa"}, {Swara: "Pa", DurationMs: -1}},
		"bad direction": {{Swara: "Sa"}, {Swara: "Pa", Direction: "sideways"}},
	}
	for name, notes := range cases {
		if err := checkNoteEvents(notes); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}
