// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { uploadToS3 } from '@/lib/s3'
import { PDFParse } from 'pdf-parse'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // 1. check user is logged in
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. get the uploaded file from form data
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files allowed' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    // 3. convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // 4. extract text from PDF (used for AI later)
    const parser = new PDFParse({ data: buffer })
    const pdfData = await parser.getText()
    const extractedText = pdfData.text
    await parser.destroy()

    // 5. create unique key and upload to S3
    const s3Key = `documents/${session.user.id}/${Date.now()}-${file.name}`
    await uploadToS3(s3Key, buffer, 'application/pdf')

    // 6. save document record to database
    const document = await prisma.document.create({
      data: {
        name:    file.name,
        s3Key,
        content: extractedText,   // we'll add this field to schema next
        userId:  session.user.id,
      },
    })

    // trigger embedding in background (don't await — let upload return fast)
    fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/embed`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ documentId: document.id }),
    })

    return NextResponse.json({ document }, { status: 201 })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
