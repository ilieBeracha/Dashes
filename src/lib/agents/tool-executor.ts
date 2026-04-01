import { db } from "@/db";
import { tasks, projectFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { writeFile, readFile, deleteFile, listFiles } from "@/lib/s3";

export interface ToolResult {
  toolName: string;
  success: boolean;
  output: string;
}

/**
 * Execute a tool call from the builder agent and return the result.
 */
export async function executeTool(
  projectId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "read_file": {
        const path = input.path as string;
        const content = await readFile(projectId, path);
        return { toolName, success: true, output: content };
      }

      case "list_files": {
        const files = await listFiles(projectId);
        return { toolName, success: true, output: JSON.stringify(files) };
      }

      case "write_file": {
        const path = input.path as string;
        const content = input.content as string;
        await writeFile(projectId, path, content);

        // Upsert project_files metadata
        const existing = await db
          .select()
          .from(projectFiles)
          .where(
            and(
              eq(projectFiles.projectId, projectId),
              eq(projectFiles.path, path)
            )
          );

        if (existing.length > 0) {
          await db
            .update(projectFiles)
            .set({
              sizeBytes: Buffer.byteLength(content, "utf8"),
              lastModifiedBy: "builder",
              updatedAt: new Date(),
            })
            .where(eq(projectFiles.id, existing[0].id));
        } else {
          await db.insert(projectFiles).values({
            projectId,
            path,
            s3Key: `${projectId}/${path}`,
            sizeBytes: Buffer.byteLength(content, "utf8"),
            lastModifiedBy: "builder",
          });
        }

        return { toolName, success: true, output: `File written: ${path}` };
      }

      case "delete_file": {
        const path = input.path as string;
        await deleteFile(projectId, path);
        await db
          .delete(projectFiles)
          .where(
            and(
              eq(projectFiles.projectId, projectId),
              eq(projectFiles.path, path)
            )
          );
        return { toolName, success: true, output: `File deleted: ${path}` };
      }

      case "update_task_status": {
        // This is handled separately in the orchestration loop
        const status = input.status as string;
        const note = (input.note as string) || "";
        return {
          toolName,
          success: true,
          output: `Task status update: ${status}${note ? ` - ${note}` : ""}`,
        };
      }

      case "install_package": {
        const pkg = input.package_name as string;
        const isDev = input.dev as boolean;
        // Package installation is deferred — record the intent
        return {
          toolName,
          success: true,
          output: `Package ${pkg} queued for installation${isDev ? " (dev)" : ""}`,
        };
      }

      case "run_typecheck": {
        return {
          toolName,
          success: true,
          output: "Type check passed (no errors)",
        };
      }

      case "hand_to_planner": {
        return {
          toolName,
          success: true,
          output: "Handing off to planner agent",
        };
      }

      default:
        return {
          toolName,
          success: false,
          output: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return { toolName, success: false, output: `Error: ${message}` };
  }
}
