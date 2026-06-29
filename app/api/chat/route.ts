// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { messages, documentId } = await req.json() as {
    messages: ChatMessage[]
    documentId: string
  }
  const question = messages[messages.length - 1].content

  // 1. embed the user's question
  const queryEmbedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: question,
  })
  const vector = queryEmbedding.data[0].embedding

  // 2. find the 5 most similar chunks using pgvector cosine similarity
  const similarChunks = await prisma.$queryRaw`
    SELECT content, 1 - (embedding <=> ${JSON.stringify(vector)}::vector) AS similarity
    FROM "Chunk"
    WHERE "documentId" = ${documentId}
    ORDER BY embedding <=> ${JSON.stringify(vector)}::vector
    LIMIT 5
  ` as { content: string; similarity: number }[]

  // 3. build context from retrieved chunks
  const context = similarChunks
    .map((c, i) => `[Excerpt ${i + 1}]\n${c.content}`)
    .join('\n\n')

  // 4. save user message to DB
  await prisma.message.create({
    data: { content: question, role: 'user', documentId },
  })

  // 5. generate the AI response
  const response = await openai.chat.completions.create({
    model:  'gpt-4o-mini',   // cheap + fast, perfect for this
    stream: false,
    messages: [
      {
        role: 'system',
        content: `You are a helpful assistant answering questions about a document.
Use ONLY the context below to answer. If the answer isn't in the context, say so.

Context:
${context}`,
      },
      ...messages,
    ],
  })

  const assistantMessage = response.choices[0]?.message.content ?? ''

  // 6. save assistant reply to DB
  await prisma.message.create({
    data: { content: assistantMessage, role: 'assistant', documentId },
  })

  return NextResponse.json({ message: assistantMessage })
}
