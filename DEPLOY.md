
# Deployment instructions

## Deploy backend to Render (Node + Postgres)
1. Push this repo to GitHub.
2. Create a new Web Service on Render, connect GitHub repo. Set the root to `backend` (or create separate services for backend and frontend).
3. Build command: `npm install && npm run migrate`
4. Start command: `npm start`
5. Add environment variables (from backend/.env.example). If you create a Render Postgres, set DATABASE_URL there.
6. Deploy. The backend will serve the frontend static files if both are deployed together.

## Deploy frontend to GitHub Pages (optional)
1. Push the `frontend` folder to a GitHub repo branch configured for Pages.
2. In GitHub Pages settings, set source branch/folder.
3. Update `FRONTEND_URL` in backend environment variables to the GitHub Pages URL (used for Stripe redirects).

## Notes
- Replace placeholder keys with real keys.
- For production, replace local uploads with S3/Cloud storage and secure SMTP.
