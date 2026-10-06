import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET ?? "change-me-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }
}));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "sua-hsba-api" }));

app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
