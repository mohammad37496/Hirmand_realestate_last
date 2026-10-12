import { defineEventHandler, setResponseHeader } from "h3";

export default defineEventHandler((event) => {
  setResponseHeader(event, "x-content-type-options", "nosniff");
  setResponseHeader(event, "referrer-policy", "strict-origin-when-cross-origin");
  // The app offers nearby listings, property-location capture, and directions.
  // Keep camera/microphone disabled, but permit geolocation on this origin so
  // those explicit, user-triggered browser features can request permission.
  setResponseHeader(event, "permissions-policy", "camera=(), microphone=(), geolocation=(self)");
  setResponseHeader(event, "x-frame-options", "SAMEORIGIN");
});
