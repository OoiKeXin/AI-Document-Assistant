// app/dashboard/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Document = { id: string; name: string; createdAt: string }

export default function DashboardPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // load documents on page load
  useEffect(() => { fetchDocuments() }, [])

  async function fetchDocuments() {
    const res = await fetch('/api/documents')
    const data = await res.json()
    setDocuments(data.documents || [])
  }

  async function handleUpload(file: File) {
    setUploading(true)
    setError('')
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Upload failed')
    } else {
      fetchDocuments()   // refresh list
    }
    setUploading(false)
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type === 'application/pdf') handleUpload(file)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">My Documents</h1>

        {/* Upload zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors mb-6"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={onFilePicked}
          />
          <p className="text-gray-500 text-sm">
            {uploading
              ? 'Uploading...'
              : 'Drag and drop a PDF here, or click to select'}
          </p>
          <p className="text-gray-400 text-xs mt-1">PDF only · Max 10MB</p>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {/* Document list */}
        {documents.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            No documents yet — upload your first PDF above
          </p>
        ) : (
          <ul className="space-y-3">
            {documents.map(doc => (
              <li
                key={doc.id}
                onClick={() => router.push(`/chat/${doc.id}`)}
                className="bg-white rounded-xl px-5 py-4 flex items-center justify-between cursor-pointer hover:shadow-sm transition border border-gray-100"
              >
                <div>
                  <p className="text-sm font-medium">{doc.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-indigo-500 text-sm">Chat →</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}