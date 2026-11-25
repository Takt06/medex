import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, MapPin, RotateCcw } from 'lucide-react';
import { getMapTileConfig, validateOlongapoCoordinates } from '../../utils/medexRules';

interface LocationPinPickerProps {
  latitude: number;
  longitude: number;
  barangayName?: string;
  onChangeCoords: (lat: number, lng: number) => void;
  onResetToBarangayCenter?: () => void;
  heightClass?: string;
  title?: string;
  helperText?: string;
}

export const LocationPinPicker: React.FC<LocationPinPickerProps> = ({
  latitude,
  longitude,
  barangayName,
  onChangeCoords,
  onResetToBarangayCenter,
  heightClass = 'h-48',
  title = 'Pin Store Location on Olongapo Map',
  helperText = 'Click anywhere on the map to set the exact pharmacy pin.',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const haloRef = useRef<L.CircleMarker | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const onChangeRef = useRef(onChangeCoords);
  const [boundsError, setBoundsError] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChangeCoords;
  }, [onChangeCoords]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const isDark =
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const tileCfg = getMapTileConfig(isDark);

    const map = L.map(containerRef.current, {
      center: [latitude, longitude],
      zoom: 15,
      minZoom: 12,
      maxZoom: tileCfg.maxZoom,
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

    const halo = L.circleMarker([latitude, longitude], {
      radius: 16,
      fillColor: '#0D9488',
      color: '#0D9488',
      weight: 1,
      opacity: 0.35,
      fillOpacity: 0.18,
      interactive: false,
    }).addTo(map);

    const marker = L.circleMarker([latitude, longitude], {
      radius: 8,
      fillColor: '#0D9488',
      color: '#FFFFFF',
      weight: 3,
      opacity: 1,
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const check = validateOlongapoCoordinates(e.latlng.lat, e.latlng.lng);
      if (!check.valid) {
        setBoundsError(check.error);
        return;
      }
      setBoundsError(null);
      onChangeRef.current(check.lat, check.lng);
    });

    mapRef.current = map;
    tileLayerRef.current = tileLayer;
    haloRef.current = halo;
    markerRef.current = marker;

    // Ensure Leaflet measures container properly after modal open animations settle
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 180);

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
      window.clearTimeout(timer);
      observer?.disconnect();
      map.stop();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      haloRef.current = null;
      markerRef.current = null;
    };
    // Mount once; updates below sync lat/lng cleanly without recreating Leaflet instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const halo = haloRef.current;
    const marker = markerRef.current;
    if (!map || !halo || !marker) return;

    const pos: L.LatLngExpression = [latitude, longitude];
    halo.setLatLng(pos);
    marker.setLatLng(pos);
    map.panTo(pos, { animate: false });
  }, [latitude, longitude]);

  return (
    <div className="rounded-2xl border border-white/65 dark:border-white/14 bg-white/40 dark:bg-slate-950/38 shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.85)] dark:shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.12)] p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
          <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
          <span>{title}</span>
        </div>
        {onResetToBarangayCenter && (
          <button
            type="button"
            onClick={() => {
              setBoundsError(null);
              onResetToBarangayCenter();
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-white/75 dark:border-white/16 bg-white/72 dark:bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/20 whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            <span>
              {barangayName ? `Center on ${barangayName}` : 'Reset to Barangay Center'}
            </span>
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-700 dark:text-slate-300">{helperText}</p>

      <div className="relative">
        <div
          ref={containerRef}
          data-testid="location-pin-picker"
          role="region"
          aria-label={title}
          className={`w-full ${heightClass} rounded-xl border border-white/70 dark:border-white/16 overflow-hidden cursor-crosshair bg-slate-100 dark:bg-slate-900 relative z-0`}
        />
        {tileError && (
          <div className="absolute bottom-2 left-2 z-[20] rounded-lg border border-amber-300 dark:border-amber-700 bg-white/95 dark:bg-slate-900/95 px-2.5 py-1 text-[11px] text-amber-900 dark:text-amber-200 shadow-sm flex items-center gap-2">
            <span>Map tiles offline — click anywhere to pin.</span>
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-mono text-slate-700 dark:text-slate-300 tabular-nums">
          <Crosshair className="w-3 h-3 text-teal-600 dark:text-teal-400" />
          Pin: {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </span>
        {barangayName && (
          <span className="text-slate-500 dark:text-slate-400">
            Brgy. {barangayName}, Olongapo City
          </span>
        )}
      </div>

      {boundsError && (
        <p role="alert" className="text-[11px] font-medium text-red-700 dark:text-red-400">
          {boundsError}
        </p>
      )}
    </div>
  );
};

