// The public library uses only the reviewed, licensed corpus bundled with the app.
// Private quarantine and staging archives are deliberately outside this publication.
export async function loadLibraryRows(active) {
  return active.map(row => ({ ...row, browseStatus: 'verified', browseNote: '' }))
}
