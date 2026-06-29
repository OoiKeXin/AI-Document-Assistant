// app/api/documents/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const documents = await prisma.document.findMany({
    where:   { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select:  { id: true, name: true, createdAt: true }, // don't return full content
  })

  return NextResponse.json({ documents })
}