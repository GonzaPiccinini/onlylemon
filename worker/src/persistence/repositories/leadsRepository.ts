import { prisma } from '../prisma/client.js';
import { Lead, LEADS_STATUS } from '../../generated/prisma/client.js';

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

export async function saveLead(data: CreateLeadData): Promise<Lead> {
  return prisma.lead.create({
    data,
  });
}

export async function getLeadByCode(code: string): Promise<Lead | null> {
  return prisma.lead.findUnique({
    where: { code },
  });
}

export async function updateLead(
  id: string,
  data: UpdateLeadData,
): Promise<Lead> {
  return prisma.lead.update({
    where: { id },
    data,
  });
}

export async function markLeadAsContactedIfPending(
  id: string,
  phone: string,
  now: Date,
): Promise<number> {
  const result = await prisma.lead.updateMany({
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

export async function getLatestContactedLeadByPhone(phone: string) {
  return prisma.lead.findFirst({
    where: {
      phone,
      status: 'CONTACTED',
    },
    orderBy: {
      matchedAt: 'desc',
    },
  });
}

export async function getLatestTrackedLeadByPhone(phone: string) {
  return prisma.lead.findFirst({
    where: {
      phone,
      status: {
        in: ['CONTACTED', 'CONVERTED'],
      },
    },
    orderBy: {
      matchedAt: 'desc',
    },
  });
}

export async function markLeadAsConvertedIfContacted(id: string): Promise<number> {
  const result = await prisma.lead.updateMany({
    where: {
      id,
      status: 'CONTACTED',
      convertedAt: null,
    },
    data: {
      status: 'CONVERTED',
      convertedAt: new Date(),
    },
  });

  return result.count;
}
