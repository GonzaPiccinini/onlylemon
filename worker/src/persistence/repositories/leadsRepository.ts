import { LeadStatus } from '../../generated/prisma/client.js';
import { prisma } from '../prisma/client.js';

type CreateLeadData = {
  code: string;
  fbc: string;
  fbp: string;
  userAgent: string;
  metaPixelId: string;
  expiresAt: Date;
};

type UpdateLeadData = {
  status?: LeadStatus;
  phone?: string;
  cashierId?: string | null;
  contactedAt?: Date | null;
};

export async function saveLead(data: CreateLeadData) {
  return prisma.lead.create({
    data,
  });
}

export async function getLeadByCode(code: string) {
  return prisma.lead.findUnique({
    where: { code },
  });
}

export async function updateLead(id: string, data: UpdateLeadData) {
  return prisma.lead.update({
    where: { id },
    data,
  });
}

export async function markLeadAsContacted(
  id: string,
  phone: string,
  cashierId: string,
  now: Date,
): Promise<number> {
  const result = await prisma.lead.updateMany({
    where: {
      id,
      status: 'NOT_CONTACTED',
      expiresAt: {
        gt: now,
      },
      contactedAt: null,
    },
    data: {
      phone,
      cashierId,
      status: 'CONTACTED',
      contactedAt: now,
    },
  });

  return result.count;
}

export async function expireLeadIfStillOpen(id: string): Promise<number> {
  const result = await prisma.lead.updateMany({
    where: {
      id,
      status: {
        in: ['NOT_CONTACTED', 'CONTACTED'],
      },
    },
    data: {
      status: 'EXPIRED',
    },
  });

  return result.count;
}
