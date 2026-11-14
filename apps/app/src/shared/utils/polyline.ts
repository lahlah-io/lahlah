/**
 * Decoder polyline berformat Google/OSRM.
 * OSRM `polyline6` memakai presisi 1e6, jadi koordinat dibagi 10^6.
 */
export function decodePolyline(
  encoded: string,
  precision = 6,
): [number, number][] {
  const factor = 10 ** precision;
  const coordinates: [number, number][] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const decodeValue = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    latitude += decodeValue();
    longitude += decodeValue();

    const nextLongitude = longitude / factor;
    const nextLatitude = latitude / factor;

    if (Number.isFinite(nextLongitude) && Number.isFinite(nextLatitude)) {
      coordinates.push([nextLongitude, nextLatitude]);
    }
  }

  return coordinates;
}
