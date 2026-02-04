import { z } from "zod";

export const ChannelHeartbeatVisibilitySchema = z
  .object({
    showOk: z.boolean().optional(),
    showAlerts: z.boolean().optional(),
    useIndicator: z.boolean().optional(),
  })
  .strict()
  .optional();

/** Optional model override for channel sessions (provider/model string or alias). */
export const ChannelModelSchema = z.string().optional();
