import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  BlobServiceClient,
  BlobSASPermissions,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob'
export const dynamic = 'force-dynamic'

function azureBlobSasUrl(blobName: string, permissions: string, ttlSeconds: number): string {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME!
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY!
  const container = process.env.AZURE_BLOB_CONTAINER ?? 'mdb-imports'

  const credential = new StorageSharedKeyCredential(accountName, accountKey)
  const startsOn = new Date(Date.now() - 60_000)
  const expiresOn = new Date(Date.now() + ttlSeconds * 1000)

  const sasParams = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName,
      permissions: BlobSASPermissions.parse(permissions),
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
    },
    credential,
  )

  return `https://${accountName}.blob.core.windows.net/${container}/${blobName}?${sasParams}`
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { filename } = await req.json()
  const blobPath = `${user.id}/${Date.now()}_${filename}`

  // Write-only SAS valid for 2 hours (upload only)
  const signedUrl = azureBlobSasUrl(blobPath, 'cw', 7200)

  return NextResponse.json({ path: blobPath, signedUrl })
}
