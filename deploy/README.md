# NeoNEI deployment profile examples

These files are examples, not local machine configuration. They use Linux-style soft paths so the public website does not depend on a GTNH game directory during requests.

## Runtime-only public website profile

- Build frontend once and serve `frontend/dist` as static files.
- Serve `/dist-data`, `/publish`, and `/contracts` as immutable/static artifacts; `/canonical` is retired from the public runtime path.
- Start backend with `NEONEI_PUBLIC_RUNTIME_ONLY=1` so dev-only `/lab` and legacy dynamic data routes stay out of the public hot path.
- Point `NESQL_EXPORT_ROOT` only at import/build time; public requests should read already-published runtime artifacts.

## Files

- `systemd/neonei-backend.service.example`: Linux service template for the backend runtime.
- `nginx/neonei-public-runtime.conf.example`: static/CDN-friendly reverse proxy template.
- Root `docker-compose.yml`: local container smoke profile using project-relative volumes.
