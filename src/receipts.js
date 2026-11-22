// Receipt photos: shrink on the phone, then upload to the plan on the server.
// Only the photo's id is kept in the shared plan (on the expense).
import { api } from './sync.jsx'

const MAX_SIDE = 1600
const MAX_BYTES = 800_000

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not a photo')) }
    img.src = url
  })
}

function toBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

// A phone photo is often 3-8 MB. This makes it a JPEG of a few hundred KB,
// still sharp enough to read a receipt. It also drops the photo's location data.
export async function shrinkPhoto(file) {
  const img = await loadImage(file)
  let side = MAX_SIDE
  for (let round = 0; round < 4; round++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.75, 0.6, 0.45]) {
      const blob = await toBlob(canvas, quality)
      if (blob && blob.size <= MAX_BYTES) return blob
    }
    side = Math.round(side * 0.7)
  }
  throw new Error('this photo is too large')
}

export async function uploadReceipt(file) {
  const blob = await shrinkPhoto(file)
  const { id } = await api('/api/receipts', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
  return id
}

export async function removeReceipt(id) {
  try {
    await api(`/api/receipts/${id}`, { method: 'DELETE' })
  } catch (error) {
    // Already gone is fine. Anything else: the photo stays on the server until the plan is deleted.
    if (error.status !== 404) throw error
  }
}

export const receiptUrl = (id) => `/api/receipts/${id}`
