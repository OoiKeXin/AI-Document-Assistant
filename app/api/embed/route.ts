// app/api/embed/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { openai } from '@/lib/openai'

// split text into overlapping chunks
function splitIntoChunks(text: string, size = 500, overlap = 50): string[] {
  const words = text.split(' ')
  const chunks: string[] = []
  let i = 0
  while (i < words.length) {
    chunks.push(words.slice(i, i + size).join(' '))
    i += size - overlap
  }
  return chunks.filter(c => c.trim().length > 20)
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { documentId } = await req.json()

    // get document + its extracted text from DB
    const document = await prisma.document.findUnique({
      where: { id: documentId, userId: session.user.id },
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // split text into chunks
    const chunks = splitIntoChunks(document.content)

    // get embeddings from OpenAI for all chunks at once
    const embeddingRes = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: chunks,
    })

    // delete old chunks for this document (re-embed if called again)
    await prisma.chunk.deleteMany({ where: { documentId } })

    // save each chunk + its embedding to DB using raw SQL (pgvector)
    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddingRes.data[i].embedding
      await prisma.$executeRaw`
        INSERT INTO "Chunk" (id, content, embedding, "documentId")
        VALUES (gen_random_uuid(), ${chunks[i]}, ${JSON.stringify(embedding)}::vector, ${documentId})
      `
    }

    return NextResponse.json({
      message: 'Embedded successfully',
      chunks: chunks.length,
    })

  } catch (error) {
    console.error('Embed error:', error)
    return NextResponse.json({ error: 'Embedding failed' }, { status: 500 })
  }
}
