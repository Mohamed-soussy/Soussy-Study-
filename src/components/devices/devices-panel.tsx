"use client";

import QRCode from "qrcode";
import { Laptop, Link2, Smartphone, Unlink, Volume2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Chip, Input, Select } from "@/components/ui/primitives";
import { getRepo3, type Device, type LinkCode } from "@/lib/data/repo3";
import { onPresence, sync, type DeviceRole } from "@/lib/devices/sync";
import { deviceId } from "@/lib/session/store";
import { audioDevice, deviceName } from "./device-sync";

const ROLES: DeviceRole[] = ["everything", "remote", "flashcards", "chat", "camera", "scanner", "whiteboard"];

function randomCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

/** Settings → Devices (section 4A): link, list, unlink, roles and audio. */
export function DevicesPanel({ initialCode }: { initialCode?: string }) {
  const t = useTranslations("devices");
  const locale = useLocale();
  const repo3 = getRepo3();
  const me = deviceId();
  const [devices, setDevices] = useState<Device[]>([]);
  const [name, setName] = useState(deviceName());
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [claim, setClaim] = useState<LinkCode | null>(null);
  const [entered, setEntered] = useState(initialCode ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [online, setOnline] = useState<string[]>([]);
  const [audio, setAudio] = useState<string | null>(audioDevice());

  const reload = useCallback(() => repo3.devices.list().then(setDevices).catch(() => {}), [repo3]);
  useEffect(() => {
    reload();
    return onPresence(() => setOnline(sync()?.online() ?? []));
  }, [reload]);

  // Device A: wait for the other device to claim the code, then ask to confirm.
  useEffect(() => {
    if (!code) return;
    const id = setInterval(async () => {
      const row = await repo3.links.get(code).catch(() => null);
      if (row?.claimed_by) {
        setClaim(row);
        clearInterval(id);
      }
    }, 2000);
    const stop = setTimeout(() => {
      clearInterval(id);
      setCode(null);
      setQr(null);
    }, 5 * 60_000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [code, repo3]);

  // Arriving from a scanned QR code: claim it straight away.
  useEffect(() => {
    if (initialCode && /^\d{6}$/.test(initialCode)) join(initialCode);
  }, [initialCode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startLink() {
    setMsg(null);
    const c = randomCode();
    await repo3.devices.upsert({ id: me, name });
    await repo3.links.create(c, me);
    setCode(c);
    setClaim(null);
    setQr(await QRCode.toDataURL(`${window.location.origin}/link?code=${c}`, { margin: 1, width: 200 }));
  }

  async function confirm() {
    if (!claim?.claimed_by) return;
    try {
      await repo3.devices.upsert({ id: claim.claimed_by, name: claim.claimed_name ?? "Device" });
      await repo3.devices.setLinked(me, true);
      await repo3.devices.setLinked(claim.claimed_by, true);
      sync()?.send({ type: "linked", deviceId: claim.claimed_by, by: me });
      await repo3.links.remove(claim.code);
      setMsg(t("confirmed"));
    } catch (e) {
      setMsg(e instanceof Error && /at most 3/.test(e.message) ? t("max") : String(e instanceof Error ? e.message : e));
    }
    setCode(null);
    setQr(null);
    setClaim(null);
    reload();
  }

  async function join(c: string) {
    setMsg(null);
    await repo3.devices.upsert({ id: me, name });
    const ok = await repo3.links.claim(c, me, name).catch(() => false);
    setMsg(ok ? t("claimed") : t("badCode"));
  }

  const others = devices.filter((d) => d.id !== me);
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar" : "en", { numeric: "auto" });
  const ago = (iso: string) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return min < 60 ? rtf.format(-min, "minute") : min < 1440 ? rtf.format(-Math.round(min / 60), "hour") : rtf.format(-Math.round(min / 1440), "day");
  };

  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="devices">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted">{t("text")}</p>
      {repo3.mode === "demo" && <p className="rounded-[10px] bg-warning/10 p-3 text-sm">{t("demo")}</p>}

      <Card className="flex flex-col gap-3 p-4">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <Laptop className="size-4 text-muted" aria-hidden />
          <span className="font-medium">{t("thisDevice")}</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              try {
                localStorage.setItem("soussy.device.name", name);
              } catch {
                /* ignore */
              }
              repo3.devices.upsert({ id: me, name }).catch(() => {});
            }}
            aria-label={t("rename")}
            className="h-9 w-48"
          />
        </label>

        {others.length === 0 ? (
          <p className="text-sm text-muted">{t("none")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {others.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                <Smartphone className="size-4 text-muted" aria-hidden />
                <span className="font-medium">{d.name}</span>
                {d.linked && <Chip color="var(--primary)">{t("linked")}</Chip>}
                {online.includes(d.id) ? <Chip color="var(--success)">{t("online")}</Chip> : <span className="text-xs text-muted">{t("lastSeen", { when: ago(d.last_seen) })}</span>}
                {d.linked && (
                  <div className="ms-auto flex flex-wrap items-center gap-2">
                    <Select aria-label={t("shows")} className="h-9 w-auto text-sm" defaultValue="" onChange={(e) => e.target.value && sync()?.send({ type: "role", deviceId: d.id, role: e.target.value as DeviceRole })}>
                      <option value="">{t("shows")}</option>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`roles.${r}`)}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await repo3.devices.setLinked(d.id, false);
                        reload();
                      }}
                    >
                      <Unlink aria-hidden />
                      {t("unlink")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {others.some((d) => d.linked) && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <Volume2 className="size-4 text-muted" aria-hidden />
            {t("audio")}
            <Select
              className="h-9 w-auto"
              value={audio ?? me}
              onChange={(e) => {
                setAudio(e.target.value);
                try {
                  localStorage.setItem("soussy.audio.device", e.target.value);
                } catch {
                  /* ignore */
                }
                sync()?.send({ type: "audio", deviceId: e.target.value });
              }}
            >
              <option value={me}>{t("audioHere")}</option>
              {others
                .filter((d) => d.linked)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </Select>
          </label>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        {!code ? (
          <Button onClick={startLink} className="self-start" disabled={repo3.mode === "demo"}>
            <Link2 aria-hidden />
            {t("link")}
          </Button>
        ) : claim ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm">{t("confirm", { name: claim.claimed_name ?? "?" })}</p>
            <Button size="sm" onClick={confirm}>
              {t("confirmYes")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="" width={140} height={140} className="rounded-[8px] border border-border bg-white p-1" />
            )}
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted">{t("linkText")}</p>
              <p className="font-mono text-2xl font-semibold tracking-[0.3em]" dir="ltr">
                {code}
              </p>
              <p className="text-xs text-muted">
                {t("expires")} {t("waiting")}
              </p>
            </div>
          </div>
        )}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{6}$/.test(entered)) join(entered);
          }}
        >
          <span className="text-sm font-medium">{t("enterCode")}</span>
          <Input value={entered} onChange={(e) => setEntered(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={t("enterCodePlaceholder")} aria-label={t("enterCodePlaceholder")} inputMode="numeric" className="h-9 w-32 font-mono tracking-widest" dir="ltr" />
          <Button type="submit" size="sm" variant="outline" disabled={entered.length !== 6 || repo3.mode === "demo"}>
            {t("join")}
          </Button>
        </form>
        {msg && (
          <p className="text-sm" role="status">
            {msg}
          </p>
        )}
      </Card>
    </section>
  );
}
