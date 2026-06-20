// Client-side image compression (Phase 4). Downscales to maxDim and steps JPEG
// quality down until the blob fits maxBytes. Non-images pass through untouched.
export async function compressImage(file, { maxBytes = 200000, maxDim = 1600 } = {}) {
  if (!file || !file.type?.startsWith('image/')) return file
  const img = await loadImage(file)
  let { width, height } = img
  if (Math.max(width, height) > maxDim) {
    const s = maxDim / Math.max(width, height)
    width = Math.round(width * s); height = Math.round(height * s)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  canvas.getContext('2d').drawImage(img, 0, 0, width, height)

  let q = 0.9, blob = await toBlob(canvas, q)
  while (blob && blob.size > maxBytes && q > 0.4) { q -= 0.12; blob = await toBlob(canvas, q) }
  if (!blob) return file
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg' })
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

function toBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

export const KB = 1024
