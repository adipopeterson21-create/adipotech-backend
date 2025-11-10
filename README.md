# Adipotech Solutions — Web Deployable

Generated: 2025-11-10T06:57:52.363247Z

This repository contains a web-only project (backend + frontend) ready to deploy to Render (backend) and GitHub Pages (frontend), with the following features:
- User registration and login (JWT)
- Protected content (hidden until login)
- Admin dashboard (upload PDFs/videos)
- AI assistant endpoint (OpenAI placeholder)
- Stripe test payment endpoint (placeholder)
- PostgreSQL via DATABASE_URL (Render)
- Nodemailer email notifications (SMTP)

## Quick structure
- `/backend` — Node.js + Express app (serves API + serves frontend when deployed together)
- `/frontend` — Static site (HTML/CSS/JS). Designed to be served by backend or deployed to GitHub Pages.

## Environment
Copy `backend/.env.example` to `backend/.env` and fill values:
```
JWT_SECRET=
DATABASE_URL=postgres://user:pass@host:5432/dbname
STRIPE_SECRET_KEY=sk_test_xxx
OPENAI_API_KEY=sk_xxx
SMTP_USER=you@example.com
SMTP_PASS=your_smtp_password
ADMIN_EMAIL=adipotech@gmail.com
FRONTEND_URL=https://your-frontend-url
```
