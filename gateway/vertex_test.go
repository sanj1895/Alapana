package main

import "testing"

func TestVertexEndpoint(t *testing.T) {
	cases := map[string]string{
		"global":      "https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models/m:generateContent",
		"us-central1": "https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/publishers/google/models/m:generateContent",
	}
	for location, want := range cases {
		if got := vertexEndpoint("p", location, "m"); got != want {
			t.Errorf("%s:\n got %s\nwant %s", location, got, want)
		}
	}
}
