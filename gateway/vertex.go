package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const cloudPlatformScope = "https://www.googleapis.com/auth/cloud-platform"

// vertexClient calls Gemini through the Vertex AI generateContent REST API.
type vertexClient struct {
	http     *http.Client
	endpoint string
}

func newVertexClient(ctx context.Context, cfg config) (*vertexClient, error) {
	creds, err := googleCredentials(ctx, cfg.CredentialsB64)
	if err != nil {
		return nil, err
	}
	project := cfg.Project
	if project == "" {
		project = creds.ProjectID
	}
	if project == "" {
		return nil, errors.New("GOOGLE_CLOUD_PROJECT is required")
	}
	return &vertexClient{
		http:     oauth2.NewClient(ctx, creds.TokenSource),
		endpoint: vertexEndpoint(project, cfg.Location, cfg.Model),
	}, nil
}

// vertexEndpoint builds the generateContent URL. Regional locations use a
// regional host; the global location uses the plain host.
func vertexEndpoint(project, location, model string) string {
	host := location + "-aiplatform.googleapis.com"
	if location == "global" {
		host = "aiplatform.googleapis.com"
	}
	return fmt.Sprintf("https://%s/v1/projects/%s/locations/%s/publishers/google/models/%s:generateContent",
		host, project, location, model)
}

// googleCredentials prefers GOOGLE_CREDENTIALS_B64 (the gcloud user credentials
// the Vercel functions use) and otherwise uses Application Default Credentials:
// the service account on Cloud Run, or `gcloud auth application-default login` locally.
func googleCredentials(ctx context.Context, b64 string) (*google.Credentials, error) {
	if b64 == "" {
		creds, err := google.FindDefaultCredentials(ctx, cloudPlatformScope)
		if err != nil {
			return nil, fmt.Errorf("no Google credentials: run `gcloud auth application-default login` or set GOOGLE_CREDENTIALS_B64: %w", err)
		}
		return creds, nil
	}

	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64))
	if err != nil {
		return nil, fmt.Errorf("decode GOOGLE_CREDENTIALS_B64: %w", err)
	}
	var fields map[string]any
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, fmt.Errorf("parse GOOGLE_CREDENTIALS_B64: %w", err)
	}
	credType, _ := fields["type"].(string)
	switch google.CredentialsType(credType) {
	case google.ServiceAccount, google.AuthorizedUser:
	case "":
		// The Node functions read only client_id, client_secret and refresh_token,
		// so the stored JSON may omit its type.
		fields["type"] = string(google.AuthorizedUser)
		credType = string(google.AuthorizedUser)
		if raw, err = json.Marshal(fields); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported credential type %q in GOOGLE_CREDENTIALS_B64", credType)
	}
	return google.CredentialsFromJSONWithType(ctx, raw, google.CredentialsType(credType), cloudPlatformScope)
}

type genPart struct {
	Text string `json:"text"`
}

type genContent struct {
	Role  string    `json:"role,omitempty"`
	Parts []genPart `json:"parts"`
}

type genConfig struct {
	Temperature      float64         `json:"temperature"`
	MaxOutputTokens  int             `json:"maxOutputTokens"`
	ResponseMimeType string          `json:"responseMimeType,omitempty"`
	ThinkingConfig   *thinkingConfig `json:"thinkingConfig,omitempty"`
}

type thinkingConfig struct {
	ThinkingBudget int `json:"thinkingBudget"`
}

type genRequest struct {
	Contents         []genContent `json:"contents"`
	GenerationConfig genConfig    `json:"generationConfig"`
}

type genResponse struct {
	Candidates []struct {
		Content struct {
			Parts []genPart `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (c *vertexClient) Generate(ctx context.Context, spec promptSpec) (string, error) {
	cfg := genConfig{
		Temperature:     spec.Temperature,
		MaxOutputTokens: spec.MaxTokens,
		// Thinking off, as in the Node routes: these tasks need speed, not long reasoning.
		ThinkingConfig: &thinkingConfig{ThinkingBudget: 0},
	}
	if spec.JSON {
		cfg.ResponseMimeType = "application/json"
	}
	body, err := json.Marshal(genRequest{
		Contents:         []genContent{{Role: "user", Parts: []genPart{{Text: spec.Prompt}}}},
		GenerationConfig: cfg,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	var out genResponse
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&out); err != nil {
		return "", fmt.Errorf("decode Gemini response (status %d): %w", res.StatusCode, err)
	}
	if res.StatusCode != http.StatusOK {
		if out.Error != nil {
			return "", fmt.Errorf("gemini status %d: %s", res.StatusCode, out.Error.Message)
		}
		return "", fmt.Errorf("gemini status %d", res.StatusCode)
	}
	if len(out.Candidates) == 0 {
		return "", errors.New("gemini returned no candidates")
	}
	var text strings.Builder
	for _, p := range out.Candidates[0].Content.Parts {
		text.WriteString(p.Text)
	}
	if strings.TrimSpace(text.String()) == "" {
		return "", errors.New("gemini returned empty text")
	}
	return text.String(), nil
}

// extractJSONObject returns the JSON object in a model reply. JSON mode
// should return it bare, but a stray code fence should not fail the request.
func extractJSONObject(text string) (json.RawMessage, error) {
	text = strings.TrimSpace(text)
	if json.Valid([]byte(text)) {
		return json.RawMessage(text), nil
	}
	start, end := strings.Index(text, "{"), strings.LastIndex(text, "}")
	if start >= 0 && end > start && json.Valid([]byte(text[start:end+1])) {
		return json.RawMessage(text[start : end+1]), nil
	}
	return nil, errors.New("no JSON object in model reply")
}
