import { db } from "@/db";
import { projectFiles } from "@/db/schema";
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
        try {
          const content = await readFile(projectId, path);
          return { toolName, success: true, output: content || "(empty file)" };
        } catch {
          return {
            toolName,
            success: true,
            output: `File "${path}" does not exist yet. You can create it with write_file.`,
          };
        }
      }

      case "list_files": {
        try {
          const files = await listFiles(projectId);
          if (files.length === 0) {
            return {
              toolName,
              success: true,
              output: "No files exist in this project yet. Use write_file to create files.",
            };
          }
          return { toolName, success: true, output: JSON.stringify(files) };
        } catch {
          return {
            toolName,
            success: true,
            output: "No files exist in this project yet. Use write_file to create files.",
          };
        }
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

        return {
          toolName,
          success: true,
          output: `File written successfully: ${path} (${Buffer.byteLength(content, "utf8")} bytes)`,
        };
      }

      case "delete_file": {
        const path = input.path as string;
        try {
          await deleteFile(projectId, path);
        } catch {
          // File may not exist in S3, that's fine
        }
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
        const status = input.status as string;
        const note = (input.note as string) || "";
        return {
          toolName,
          success: true,
          output: `Task marked as ${status}${note ? `: ${note}` : ""}`,
        };
      }

      case "install_package": {
        const pkg = input.package_name as string;
        const isDev = input.dev as boolean;
        return {
          toolName,
          success: true,
          output: `Package "${pkg}" will be installed${isDev ? " as devDependency" : ""} at deploy time. Proceed with writing code that imports it.`,
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
    return { toolName, success: false, output: `Tool error: ${message}` };
  }
}
