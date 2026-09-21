"use client";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  badge?: string | number | null;
  tone?: "red" | "amber" | "green" | "blue" | "grey";
};

export type MapRoute = {
  id: string;
  points: [number, number][];
  tone?: "red" | "amber" | "green" | "blue" | "grey";
  dashed?: boolean;
};

const TONE_HEX: Record<NonNullable<MapPin["tone"]>, string> = { red: "#ff2f4f", amber: "#f0a52a", green: "#38d58a", blue: "#4b8ef5", grey: "#8d7f83" };

export function CyncroMap({
  pins,
  routes = [],
  selectedId,
  onSelect,
  radar = false,
  emptyText = "No locations to plot yet.",
  className = "",
}: {
  pins: MapPin[];
  /** Glowing polylines drawn under the pins, e.g. today's run in stop order. */
  routes?: MapRoute[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  radar?: boolean;
  emptyText?: string;
  className?: string;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current || mapRef.current) return;
      const map = L.map(container.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
        center: [39.5, -98.35],
        zoom: 4,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      window.setTimeout(() => map.invalidateSize(), 50);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  const routeKey = routes.map((r) => `${r.id}:${r.tone || ""}:${r.dashed ? "d" : "s"}:${r.points.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join(";")}`).join("|");
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      const layer = routeLayerRef.current;
      if (cancelled || !layer) return;
      layer.clearLayers();
      for (const route of routes) {
        if (route.points.length < 2) continue;
        const color = TONE_HEX[route.tone || "red"];
        // Wide translucent stroke underneath gives the neon bloom; thin bright stroke on top is the line.
        L.polyline(route.points, { color, weight: 12, opacity: 0.18, lineCap: "round", lineJoin: "round", interactive: false }).addTo(layer);
        L.polyline(route.points, { color, weight: 5, opacity: 0.35, lineCap: "round", lineJoin: "round", interactive: false }).addTo(layer);
        L.polyline(route.points, { color, weight: 2.5, opacity: 1, dashArray: route.dashed ? "6 8" : undefined, lineCap: "round", lineJoin: "round", interactive: false, className: route.dashed ? "cyncroRouteDashed" : "cyncroRoute" }).addTo(layer);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  const pinKey = pins.map((p) => `${p.id}:${p.lat.toFixed(4)},${p.lng.toFixed(4)}:${p.tone || ""}:${p.badge ?? ""}`).join("|");
  const boundsKey = pins.map((p) => p.id).join("|");

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      const map = mapRef.current, layer = layerRef.current;
      if (cancelled || !map || !layer) return;
      layer.clearLayers();
      for (const pin of pins) {
        const active = pin.id === selectedId;
        const icon = L.divIcon({
          className: "",
          html: `<div class="cyncroPin tone-${pin.tone || "red"}${active ? " active" : ""}"><i></i>${pin.badge != null && pin.badge !== "" ? `<b>${String(pin.badge)}</b>` : ""}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        const marker = L.marker([pin.lat, pin.lng], { icon, riseOnHover: true });
        marker.bindTooltip(`<strong>${escapeHtml(pin.label)}</strong>${pin.sublabel ? `<br/><span>${escapeHtml(pin.sublabel)}</span>` : ""}`, {
          direction: "top",
          offset: [0, -14],
          className: "cyncroMapTip",
        });
        marker.on("click", () => onSelectRef.current?.(pin.id));
        marker.addTo(layer);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey, selectedId]);

  useEffect(() => {
    void import("leaflet").then((L) => {
      const map = mapRef.current;
      const all: [number, number][] = [...pins.map((p) => [p.lat, p.lng] as [number, number]), ...routes.flatMap((r) => r.points)];
      if (!map || !all.length) return;
      const bounds = L.latLngBounds(all);
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, routeKey]);

  useEffect(() => {
    const map = mapRef.current, target = container.current;
    if (!map || !target) return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`cyncroMapFrame ${className}`.trim()}>
      <div ref={container} className="cyncroMapCanvas" />
      {radar && <div className="cyncroRadar" aria-hidden="true" />}
      {!pins.length && <div className="cyncroMapEmpty">{emptyText}</div>}
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
}
