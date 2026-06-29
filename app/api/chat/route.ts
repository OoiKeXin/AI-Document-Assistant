// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

function getOpenAIErrorResponse(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    'code' in error
  ) {
    const status = Number(error.status)
    const code = String(error.code)

    if (status === 429 && code === 'insufficient_quota') {
      return NextResponse.json(
        {
          error:
            'OpenAI quota exceeded. Check your OpenAI billing, usage limits, or API key project.',
        },
        { status: 429 }
      )
    }

    if (status === 403 || code === 'model_not_found') {
      return NextResponse.json(
        {
          error:
            'OpenAI model is not available for this API key/project. Check OPENAI_CHAT_MODEL or your project access.',
        },
        { status }
      )
    }
  }

  return null
}

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messages, documentId } = await req.json() as {
      messages: ChatMessage[]
      documentId: string
    }
    const question = messages[messages.length - 1]?.content

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId, userId: session.user.id },
      select: { content: true },
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    let context = document.content.slice(0, 12000)

    try {
      const queryEmbedding = await openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
        input: question,
      })
      const vector = queryEmbedding.data[0].embedding

      const similarChunks = await prisma.$queryRaw`
        SELECT content, 1 - (embedding <=> ${JSON.stringify(vector)}::vector) AS similarity
        FROM "Chunk"
        WHERE "documentId" = ${documentId}
        ORDER BY embedding <=> ${JSON.stringify(vector)}::vector
        LIMIT 5
      ` as { content: string; similarity: number }[]

      if (similarChunks.length > 0) {
        context = similarChunks
          .map((chunk, index) => `[Excerpt ${index + 1}]\n${chunk.content}`)
          .join('\n\n')
      }
    } catch (error) {
      console.warn('Embedding search failed, using document text fallback:', error)
    }

    await prisma.message.create({
      data: { content: question, role: 'user', documentId },
    })

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
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

    await prisma.message.create({
      data: { content: assistantMessage, role: 'assistant', documentId },
    })

    return NextResponse.json({ message: assistantMessage })
  } catch (error) {
    console.error('Chat error:', error)
    const openAIError = getOpenAIErrorResponse(error)
    if (openAIError) return openAIError

    return NextResponse.json({ error: 'Chat failed' }, { status: 500 })
  }
}
