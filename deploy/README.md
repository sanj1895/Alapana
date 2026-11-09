# Ālāpana on Kubernetes

Runs the whole app on a local [kind](https://kind.sigs.k8s.io/) cluster, then adds Prometheus and Grafana to watch the AI gateway, and Argo CD to deploy every push to `main`. Production is unchanged: Vercel serves the website and `api/`, and Cloud Run serves the gateway.

```
                 http://localhost
                        │
                 Traefik (Ingress)
        ┌───────────────┼────────────────┐
     /api/ai          /api               /
        │               │                │
  gateway ×2 ──► Redis  api ──► MongoDB   web (nginx)
        │ :9090
   Prometheus ──► Grafana          Argo CD ◄── github.com/sanj1895/Alapana (main)
```

| Path | What it is |
| --- | --- |
| `kind-config.yaml` | The cluster, with `localhost:80` forwarded to the Ingress |
| `k8s/` | Deployments, Services, probes and the Ingress (Kustomize) |
| `monitoring/` | The gateway's ServiceMonitor and Grafana dashboard |
| `argocd/` | Argo CD Applications for `k8s/` and `monitoring/` |
| `values/` | Helm values for Traefik and kube-prometheus-stack |
| `build-images.sh` | Builds the three images and loads them into kind |
| `create-secret.sh` | Makes the `alapana-secrets` Secret from `.env` |

## What you need

- Docker Desktop with at least 6 GB of memory (Settings → Resources)
- `kubectl`, `kind` and `helm`: `brew install kubectl kind helm`
- `.env` with your Clerk development keys (`pk_test_…`, `sk_test_…`), as for Docker Compose
- Google Cloud credentials for Gemini: `gcloud auth application-default login`

Run every command from the repo root.

## 1. Create the cluster and Ingress controller

```bash
kind create cluster --config deploy/kind-config.yaml

helm repo add traefik https://traefik.github.io/charts
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install traefik traefik/traefik -n traefik --create-namespace -f deploy/values/traefik.yaml
```

Traefik is the Ingress controller because ingress-nginx was retired in March 2026.

## 2. Deploy the app

```bash
deploy/build-images.sh        # build web, api and gateway; load them into kind
deploy/create-secret.sh       # namespace + Clerk key + Google credentials, never in git
kubectl apply -k deploy/k8s
kubectl -n alapana get pods -w   # wait until every pod is 1/1 Running
```

`-w` keeps watching and never exits on its own: once every pod is `1/1 Running`, press Ctrl-C.

Open [http://localhost](http://localhost) and sign in.

Every container has a **readiness probe**, which keeps a pod out of the Service until it answers, and a **liveness probe**, which restarts it when it stops answering. The three app services answer `GET /health`, Redis must answer `PING`, and MongoDB must answer a `ping` command. To watch them work, delete a gateway pod and see its replacement join only once it is ready:

```bash
kubectl -n alapana delete pod -l app.kubernetes.io/name=gateway --wait=false
kubectl -n alapana get pods -l app.kubernetes.io/name=gateway -w
```

To fill the local database with sample practice history (stop Docker Compose's MongoDB first, since it uses the same port):

```bash
kubectl -n alapana port-forward svc/mongo 27017:27017 &
MONGODB_URI=mongodb://localhost:27017/alapana DEMO_USER_ID=<your Clerk user ID> node scripts/seed-demo.js
```

## 3. Watch the gateway with Prometheus and Grafana

```bash
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace -f deploy/values/kube-prometheus-stack.yaml
kubectl apply -k deploy/monitoring
```

Grafana:

```bash
kubectl -n monitoring get secret monitoring-grafana -o jsonpath='{.data.admin-password}' | base64 -d; echo
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
```

Open [http://localhost:3000](http://localhost:3000), sign in as `admin` with that password, and open **Dashboards → Alapana gateway**. Use the app for a minute so there is traffic to show.

Prometheus itself, to check that both gateway pods are being scraped:

```bash
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090
```

Then open [http://localhost:9090/targets](http://localhost:9090/targets) and look for `serviceMonitor/alapana/gateway` with 2/2 up.

The gateway serves these on port 9090, which the Ingress never exposes:

| Metric | Meaning |
| --- | --- |
| `alapana_gateway_requests_total{task, code}` | AI requests by task and HTTP status |
| `alapana_gateway_request_duration_seconds{task}` | Latency histogram, mostly the Gemini call |
| `alapana_gateway_rate_limited_total{scope}` | Requests refused by the burst or daily quota |
| `alapana_gateway_redis_fallbacks_total` | Checks that used per-pod limits because Redis failed |

## 4. Deploy from git with Argo CD

Argo CD reads `deploy/k8s` and `deploy/monitoring` from `main` on GitHub, so push them first:

```bash
git push origin main
```

Install Argo CD and point it at the repo:

```bash
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl -n argocd rollout status deploy/argocd-server

kubectl apply -n argocd -f deploy/argocd/applications.yaml
```

Open the UI:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
kubectl -n argocd port-forward svc/argocd-server 8443:443
```

Open [https://localhost:8443](https://localhost:8443) (accept the self-signed certificate) and sign in as `admin`. Both `alapana` and `alapana-monitoring` should turn Synced and Healthy. Argo CD takes over the resources you applied in steps 2 and 3.

From now on, a push is a deploy. To try it:

- **Sync from git:** set `replicas: 3` in `deploy/k8s/gateway.yaml`, commit and push. Argo CD checks the repo every 3 minutes; click **Refresh** to sync now.
- **Self-heal:** run `kubectl -n alapana scale deploy/gateway --replicas=1`. Argo CD sees the cluster no longer matches git and scales it back.

## Updating the code

Images are built on your machine, not pulled from a registry, so after changing code:

```bash
deploy/build-images.sh
kubectl -n alapana rollout restart deploy/gateway deploy/api deploy/web
```

Pods use `imagePullPolicy: Never`, so they only ever run images loaded by `build-images.sh`. To make a build a tracked change in git instead, build it with its own tag (`deploy/build-images.sh v2`), set that `newTag` in `deploy/k8s/kustomization.yaml`, and push.

## When something goes wrong

| Symptom | Cause |
| --- | --- |
| `kind create cluster` says port 80 is in use | Another program has port 80. Change `hostPort` in `kind-config.yaml` to `8080` and `ALLOWED_ORIGINS` in `k8s/config.yaml` to `http://localhost:8080`, then recreate the cluster |
| Pod status `ErrImageNeverPull` | The images are not in kind yet. Run `deploy/build-images.sh` |
| Pod status `CreateContainerConfigError` | `alapana-secrets` is missing. Run `deploy/create-secret.sh` |
| Sign-in works but AI features return 401 or 403 | The address in the browser must exactly match `ALLOWED_ORIGINS`, because the gateway checks it against the Clerk token |
| Clerk will not load | Use the development keys (`pk_test_…`). Production keys only work on the production domain |
| Argo CD shows "app path does not exist" | `deploy/` is not on `main` on GitHub yet. Push it |

## Remove it all

```bash
kind delete cluster --name alapana
```
