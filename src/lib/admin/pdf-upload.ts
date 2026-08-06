/**
 * The one place a PDF arrives from a browser (#27, #28).
 *
 * Announcements and policies both accept uploads, and both accept exactly one
 * kind of file. Written twice, the signature check is the half that would drift
 * — and the half whose absence means this school's own domain serving back an
 * HTML page somebody handed it.
 */

/**
 * The largest PDF the school can upload.
 *
 * Eight megabytes, against a largest-in-the-mirror of 921 KB. Generous rather
 * than tight, because the failure this guards is a 200 MB video going into the
 * database, not a scanned newsletter being slightly heavy.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Whole megabytes, for a message a person reads. */
export function megabytes(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

/**
 * A PDF, by its first five bytes as well as by its type.
 *
 * The signature is the half that matters. A declared content type and a `.pdf`
 * on the end of a filename are both typed by whoever is uploading, so a check
 * that trusted either would accept an HTML page served back at parents from
 * this school's own domain.
 */
export function isPdf(file: File, bytes: Buffer): boolean {
  const declared = file.type === '' || file.type === 'application/pdf';
  return declared && bytes.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * The name of the file, and nothing about the machine it came from.
 *
 * Browsers send a bare filename, but this value ends up in a
 * `content-disposition` header and on a page, so the path separators and the
 * `..` that a non-browser client could send are cut here rather than trusted to
 * be absent. Anything left that is not filename-shaped becomes the fallback,
 * because a download with no name is worse than a generic one.
 */
export function plainFilename(name: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^\w. -]+/g, '').replace(/^[.\s]+/, '');
  return /\.pdf$/i.test(cleaned) ? cleaned : fallback;
}
