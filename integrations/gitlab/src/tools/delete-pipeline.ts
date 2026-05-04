import { SlateTool } from 'slates';
import { spec } from '../spec';
import { createClient, resolveProjectId, gitLabServiceError } from '../lib/helpers';
import { z } from 'zod';

export let deletePipeline = SlateTool.create(spec, {
  name: 'Delete Pipeline',
  key: 'delete_pipeline',
  description: `Permanently delete a pipeline and all of its associated resources (jobs, artifacts, logs). This action is irreversible.`,
  tags: {
    destructive: true
  }
})
  .input(
    z.object({
      projectId: z
        .string()
        .optional()
        .describe('Project ID or URL-encoded path. Falls back to config default.'),
      pipelineId: z.number().describe('The ID of the pipeline to delete')
    })
  )
  .output(
    z.object({
      deleted: z.boolean()
    })
  )
  .handleInvocation(async ctx => {
    let client = createClient(ctx.auth, ctx.config);
    let projectId = resolveProjectId(ctx.input.projectId, ctx.config.projectId);

    await client.deletePipeline(projectId, ctx.input.pipelineId);

    return {
      output: { deleted: true },
      message: `Deleted pipeline **#${ctx.input.pipelineId}** from project **${projectId}**.`
    };
  })
  .build();
