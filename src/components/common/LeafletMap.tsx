import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { getMapTileConfig } from '../../utils/medexRules';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  variant: 'pharmacy_open' | 'pharmacy_closed' | 'resident' | 'rider' | 'emergency';
}

interface LeafletMapProps {
  markers: MapMarker[];
  routePoints?: Array<[number, number]>;
  selectedMarkerId?: string | null;
  onSelectMarker?: (id: string) => void;
  heightClass?: string;
  ariaLabel?: string;
}

function getMarkerColor(variant: MapMarker['variant']): string {
  switch (variant) {
    case 'pharmacy_open':
      return '#0D9488';
    case 'pharmacy_closed':
      return '#64748B';
    case 'emergency':
      return '#DC2626';
    case 'rider':
      return '#D97706';
    case 'resident':
    default:
      return '#0F172A';
  }
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  markers,
  routePoints,
  selectedMarkerId,
  onSelectMarker,
  heightClass = 'h-72',
  ariaLabel = 'Interactive MedEx Location Map',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const isDark =
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const tileCfg = getMapTileConfig(isDark);

    const map = L.map(containerRef.current, {
      center: [14.8315, 120.2835],
      zoom: 14,
      zoomControl: true,
      zoomAnimation: false,
    });
    const tileLayer = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      subdomains: tileCfg.subdomains,
      maxNativeZoom: tileCfg.maxNativeZoom,
      maxZoom: tileCfg.maxZoom,
    }).addTo(map);

    let failedTiles = 0;
    tileLayer.on('tileload', () => {
      failedTiles = 0;
      setTileError(false);
    });
    tileLayer.on('tileerror', () => {
      failedTiles += 1;
      if (failedTiles >= 3) {
        setTileError(true);
      }
    });

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    tileLayerRef.current = tileLayer;
    layerGroupRef.current = group;

    const invalidateTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 160);

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      observer = new MutationObserver(() => {
        const nextIsDark = document.documentElement.classList.contains('dark');
        const nextCfg = getMapTileConfig(nextIsDark);
        tileLayer.setUrl(nextCfg.url);
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    return () => {
      window.clearTimeout(invalidateTimer);
      observer?.disconnect();
      map.stop();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const bounds: Array<[number, number]> = [];

    markers.forEach((m) => {
      bounds.push([m.lat, m.lng]);
      const isSelected = selectedMarkerId === m.id;
      const color = getMarkerColor(m.variant);
      const circle = L.circleMarker([m.lat, m.lng], {
        radius: isSelected ? 11 : 8,
        fillColor: color,
        color: '#FFFFFF',
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.95,
      });

      const popupContent = `<div style="font-family: 'Public Sans', sans-serif; min-width: 150px;">
        <div style="font-weight: 600; font-size: 13px; color: #0F172A;">${m.title}</div>
        ${m.subtitle ? `<div style="font-size: 12px; color: #475569; margin-top: 2px;">${m.subtitle}</div>` : ''}
      </div>`;
      circle.bindPopup(popupContent);

      circle.on('click', () => {
        if (onSelectMarker) onSelectMarker(m.id);
      });

      circle.addTo(group);
      if (isSelected) {
        circle.openPopup();
      }
    });

    if (routePoints && routePoints.length >= 2) {
      L.polyline(routePoints, {
        color: '#0D9488',
        weight: 4,
        dashArray: '6, 6',
      }).addTo(group);
      routePoints.forEach((pt) => bounds.push(pt));
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 15, { animate: false });
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15, animate: false });
    }
  }, [markers, routePoints, selectedMarkerId, onSelectMarker]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        role="region"
        aria-label={ariaLabel}
        className={`w-full ${heightClass} rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800`}
      />
      {tileError && (
        <div className="absolute bottom-3 left-3 z-[20] rounded-lg border border-amber-300 dark:border-amber-700 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-200 shadow-sm flex items-center gap-2">
          <span>Map background tiles unavailable offline. Markers remain active.</span>
          <button
            type="button"
            onClick={() => {
              setTileError(false);
              tileLayerRef.current?.redraw();
            }}
            className="font-semibold text-teal-700 dark:text-teal-400 underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

