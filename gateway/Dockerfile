# Two stages: compile in the Go image, ship only the static binary.
# The final image has no shell or package manager and runs as non-root.

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ragas.json ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/gateway .

# distroless/static includes CA certificates for calls to Google and Clerk.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/gateway /gateway
ENV PORT=8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/gateway"]
