package main

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
)

// ragas.json is generated from src/utils/ragaLogic.js by `npm run export:ragas`.
//
//go:embed ragas.json
var ragasJSON []byte

// raga is one verified dictionary entry.
type raga struct {
	Name        string   `json:"name"`
	Arohanam    []string `json:"arohanam"`
	Avarohanam  []string `json:"avarohanam"`
	Type        string   `json:"type"`
	Description string   `json:"description"`
}

type dictionary struct {
	ragas  []raga
	byName map[string]*raga
}

func loadDictionary() (*dictionary, error) {
	var ragas []raga
	if err := json.Unmarshal(ragasJSON, &ragas); err != nil {
		return nil, fmt.Errorf("parse ragas.json: %w", err)
	}
	if len(ragas) == 0 {
		return nil, errors.New("ragas.json is empty: run npm run export:ragas")
	}
	d := &dictionary{ragas: ragas, byName: make(map[string]*raga, len(ragas))}
	for i := range ragas {
		d.byName[ragas[i].Name] = &ragas[i]
	}
	return d, nil
}

func (d *dictionary) lookup(name string) (*raga, bool) {
	r, ok := d.byName[name]
	return r, ok
}
