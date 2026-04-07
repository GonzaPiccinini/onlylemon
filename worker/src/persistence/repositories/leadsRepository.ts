import { prisma } from '../prisma/client.js';
import { Leads, LEADS_STATUS } from '../../generated/prisma/client.js';

type CreateLeadData = {
  code: string;
  fbc: string;
  fbp: string;
  userAgent: string;
  expiresAt: Date;
};

type UpdateLeadData = {
  status?: LEADS_STATUS;
  phone?: string;
  matchedAt?: Date;
};

export async function saveLead(data: CreateLeadData): Promise<Leads> {
  return prisma.leads.create({
    data,
  });
}

export async function getLeadByCode(code: string): Promise<Leads | null> {
  return prisma.leads.findUnique({
    where: { code },
  });
}

export async function updateLead(id: string, data: UpdateLeadData): Promise<Leads> {
  return prisma.leads.update({
    where: { id },
    data,
  });
}

export async function markLeadAsContactedIfPending(
  id: string,
  phone: string,
  now: Date,
): Promise<number> {
  const result = await prisma.leads.updateMany({
    where: {
      id,
      status: 'PENDING',
      expiresAt: {
        gt: now,
      },
      matchedAt: null,
    },
    data: {
      phone,
      status: 'CONTACTED',
      matchedAt: now,
    },
  });

  return result.count;
}
