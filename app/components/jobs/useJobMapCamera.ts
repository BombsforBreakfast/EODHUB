"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { clampJobMapCamera, INITIAL_JOB_MAP_CAMERA, pinchJobMapCamera, zoomJobMapCamera, type JobMapCamera, type JobMapPoint } from "../../lib/jobMapViewport";

export function useJobMapCamera() {
  const canvas = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 960, height: 600 });
  const sizeRef = useRef(size);
  const [camera, setCamera] = useState(INITIAL_JOB_MAP_CAMERA);
  const cameraRef = useRef(camera);
  const pointers = useRef(new Map<number, JobMapPoint>());
  const gesture = useRef<{ camera: JobMapCamera; start: JobMapPoint[]; moved: boolean } | null>(null);
  const suppressClick = useRef(0);
  const [dragging, setDragging] = useState(false);
  const applyCamera = useCallback((next: JobMapCamera) => {
    const bounded = clampJobMapCamera(next, sizeRef.current);
    cameraRef.current = bounded;
    setCamera(bounded);
  }, []);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const measure = () => {
      const bounds = node.getBoundingClientRect(), before = sizeRef.current;
      if (bounds.width <= 0 || bounds.height <= 0 || (Math.abs(before.width - bounds.width) < .1 && Math.abs(before.height - bounds.height) < .1)) return;
      const next = { width: bounds.width, height: bounds.height };
      const ratio = Math.min(next.width / 960, next.height / 600) / Math.min(before.width / 960, before.height / 600);
      sizeRef.current = next;
      setSize(next);
      applyCamera({ ...cameraRef.current, x: cameraRef.current.x * ratio, y: cameraRef.current.y * ratio });
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds = node.getBoundingClientRect();
      applyCamera(zoomJobMapCamera(cameraRef.current, cameraRef.current.zoom * Math.exp(-event.deltaY * .003), sizeRef.current, { x: event.clientX - bounds.left, y: event.clientY - bounds.top }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); node.removeEventListener("wheel", wheel); };
  }, [applyCamera]);

  function point(event: PointerEvent<HTMLDivElement>): JobMapPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (!pointers.current.size) suppressClick.current = 0;
    if (event.target instanceof Element && event.target.closest("[data-map-zoom-controls]")) return;
    pointers.current.set(event.pointerId, point(event));
    const start = [...pointers.current.values()];
    gesture.current = { camera: cameraRef.current, start, moved: start.length > 1 };
    if (start.length > 1) for (const id of pointers.current.keys()) event.currentTarget.setPointerCapture(id);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, point(event));
    const active = [...pointers.current.values()], initial = gesture.current;
    if (active.length > 1 && initial.start.length > 1) {
      initial.moved = true;
      setDragging(true);
      applyCamera(pinchJobMapCamera(initial.camera, initial.start.slice(0, 2) as [JobMapPoint, JobMapPoint], active.slice(0, 2) as [JobMapPoint, JobMapPoint], sizeRef.current));
    } else if (initial.camera.zoom > 1) {
      const dx = active[0].x - initial.start[0].x, dy = active[0].y - initial.start[0].y;
      if (!initial.moved && Math.hypot(dx, dy) < 7) return;
      initial.moved = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      applyCamera({ ...initial.camera, x: initial.camera.x + dx, y: initial.camera.y + dy });
    }
  }
  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.moved) suppressClick.current = performance.now() + 500;
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    gesture.current = pointers.current.size ? { camera: cameraRef.current, start: [...pointers.current.values()], moved: false } : null;
    setDragging(false);
  }
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (event.detail > 0 && performance.now() < suppressClick.current) {
      event.preventDefault(); event.stopPropagation(); suppressClick.current = 0;
    }
  }
  function zoomBy(factor: number) {
    applyCamera(zoomJobMapCamera(cameraRef.current, cameraRef.current.zoom * factor, sizeRef.current));
  }
  return { canvas, size, camera, applyCamera, zoomBy, dragging, handlers: { onPointerDown, onPointerMove, onPointerUp: finishPointer, onPointerCancel: finishPointer, onClickCapture } };
}
