/**
 * infrastructure/auth/captcha-store.ts — Lupa Fiscal
 *
 * Captcha emitido por el SERVIDOR (desafío verificable server-side), sin libs.
 * El servidor genera un reto (a + b) con node:crypto, guarda la solución en un
 * store en memoria anclado a globalThis (un solo uso + TTL), y entrega al cliente
 * solo {token, a, b}. El backend verifica la respuesta contra la solución guardada.
 *
 * Esto cierra el hueco de un captcha "solo cliente": el front ya no decide si el
 * captcha es válido; lo decide el servidor. (Fricción honesta anti-scraping, no
 * anti-bot de grado bancario.)
 *
 * Formato del valor que envía el cliente: "<token>:<respuesta>".
 * Bypass para curl / tests / CI: si el valor === CAPTCHA_BYPASS_TOKEN, acepta.
 */
import { randomInt, randomUUID } from "node:crypto";

interface RetoGuardado {
  solucion: number;
  expira: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 min
const STORE_KEY = "__lupaFiscalCaptchaStore__";

function store(): Map<string, RetoGuardado> {
  const g = globalThis as Record<string, unknown>;
  if (!g[STORE_KEY]) g[STORE_KEY] = new Map<string, RetoGuardado>();
  return g[STORE_KEY] as Map<string, RetoGuardado>;
}

export interface RetoCaptcha {
  token: string;
  a: number;
  b: number;
}

/** Genera y persiste un reto nuevo; devuelve lo que ve el cliente. */
export function generarReto(): RetoCaptcha {
  const a = randomInt(1, 10); // 1..9
  const b = randomInt(1, 10); // 1..9
  const token = randomUUID();
  store().set(token, { solucion: a + b, expira: Date.now() + TTL_MS });
  return { token, a, b };
}

/**
 * Verifica el valor del cliente ("token:respuesta"). Un solo uso (consume el
 * reto). Acepta también el bypass por env para automatización.
 */
export function verificarReto(valor: string): boolean {
  const bypass = process.env.CAPTCHA_BYPASS_TOKEN;
  if (bypass && valor === bypass) return true;

  if (typeof valor !== "string") return false;
  const sep = valor.indexOf(":");
  if (sep < 0) return false;

  const token = valor.slice(0, sep);
  const respuesta = Number(valor.slice(sep + 1));
  const s = store();
  const reto = s.get(token);
  if (!reto) return false;
  s.delete(token); // un solo uso: evita replay
  if (Date.now() > reto.expira) return false;
  return Number.isFinite(respuesta) && respuesta === reto.solucion;
}
