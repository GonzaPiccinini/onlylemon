import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/api/admin.service";
import type { AdminStatus, CreateAdminInput, UpdateAdminInput } from "@/types/domain";

const adminMgmtKeys = {
  admins: ["admins"] as const,
};

export const useAdminsList = () =>
  useQuery({
    queryKey: adminMgmtKeys.admins,
    queryFn: adminService.listAdmins,
  });

export const useCreateAdmin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAdminInput) => adminService.createAdmin(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminMgmtKeys.admins });
    },
  });
};

export const useUpdateAdmin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ adminId, input }: { adminId: string; input: UpdateAdminInput }) =>
      adminService.updateAdmin(adminId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminMgmtKeys.admins });
    },
  });
};

export const useSetAdminStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ adminId, status }: { adminId: string; status: AdminStatus }) =>
      adminService.setAdminStatus(adminId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminMgmtKeys.admins });
    },
  });
};
