#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd, stderr, stdout } from "node:process";
import {
  Node,
  Project,
  SyntaxKind,
  type Decorator,
  type FunctionDeclaration,
  type MethodDeclaration,
} from "ts-morph";
import type { HttpMethod, RoutesManifest, RoutesManifestRoute } from "./types";

const METHOD_DECORATORS: Record<string, HttpMethod> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Head: "HEAD",
  Options: "OPTIONS",
};

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  switch (command) {
    case "scan": {
      await runScan(rest);
      return;
    }
    default: {
      stderr.write(`Unknown command: ${command}\n`);
      printUsage();
      process.exitCode = 1;
    }
  }
}

async function runScan(args: string[]): Promise<void> {
  const options = parseScanArgs(args);
  const project = options.project
    ? new Project({ tsConfigFilePath: options.project })
    : new Project();

  if (options.globs.length === 0) {
    options.globs.push("src/**/*.ts");
  }

  project.addSourceFilesAtPaths(options.globs);

  const manifest: RoutesManifest = { routes: [] };

  for (const sourceFile of project.getSourceFiles()) {
    for (const fn of sourceFile.getFunctions()) {
      if (!fn.isExported() && !fn.isDefaultExport()) {
        continue;
      }

      const route = extractRoute(fn, options.inferName);
      if (route) {
        manifest.routes.push(route);
      }
    }

    for (const cls of sourceFile.getClasses()) {
      if (!cls.isExported() && !cls.isDefaultExport()) {
        continue;
      }

      for (const method of cls.getMethods()) {
        // only consider static methods to avoid instance bindings
        if (!method.isStatic()) {
          continue;
        }

        const route = extractRoute(method, options.inferName);
        if (route) {
          manifest.routes.push(route);
        }
      }
    }
  }

  manifest.routes.sort((a, b) => {
    if (a.path === b.path) {
      return a.method.localeCompare(b.method);
    }
    return a.path.localeCompare(b.path);
  });

  const outPath = resolve(cwd(), options.outFile);
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  stdout.write(`Wrote ${manifest.routes.length} route(s) to ${outPath}\n`);
}

function parseScanArgs(args: string[]): {
  globs: string[];
  outFile: string;
  project?: string;
  inferName: boolean;
} {
  const result = {
    globs: [] as string[],
    outFile: "routes.manifest.json",
    project: undefined as string | undefined,
    inferName: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    switch (value) {
      case "--glob":
      case "-g": {
        const glob = args[++i];
        if (!glob) {
          throw new Error("Missing value for --glob");
        }
        result.globs.push(glob);
        break;
      }
      case "--out":
      case "-o": {
        const out = args[++i];
        if (!out) {
          throw new Error("Missing value for --out");
        }
        result.outFile = out;
        break;
      }
      case "--project":
      case "-p": {
        const project = args[++i];
        if (!project) {
          throw new Error("Missing value for --project");
        }
        result.project = project;
        break;
      }
      case "--infer-name": {
        result.inferName = true;
        break;
      }
      default: {
        throw new Error(`Unknown option: ${value}`);
      }
    }
  }

  return result;
}

function extractRoute(
  fn: FunctionDeclaration | MethodDeclaration,
  inferName: boolean,
): RoutesManifestRoute | undefined {
  const decorators = collectDecorators(fn);

  const methodDecorators = decorators.filter((decorator) => {
    const name = decorator.getName();
    return Boolean(name && METHOD_DECORATORS[name]);
  });

  if (methodDecorators.length === 0) {
    return undefined;
  }

  if (methodDecorators.length > 1) {
    const funcName = fn.getName() ?? "<anonymous>";
    throw new Error(`Route "${funcName}" has multiple HTTP method decorators.`);
  }

  const methodDecorator = methodDecorators[0];

  const method = METHOD_DECORATORS[methodDecorator.getName() ?? ""];
  const path = readPath(methodDecorator) ?? (inferName ? inferPathFromName(fn) : undefined);

  if (!path) {
    const funcName = fn.getName() ?? "<anonymous>";
    throw new Error(`Route "${funcName}" is missing a path. Pass one to the decorator or enable --infer-name.`);
  }

  const firebaseDecorator = decorators.find((decorator) => decorator.getName() === "FirebaseAuth");

  const auth = firebaseDecorator ? readFirebaseAuth(firebaseDecorator) : { type: "none" as const };

  return {
    method,
    path,
    auth,
  };
}

function collectDecorators(fn: FunctionDeclaration | MethodDeclaration): Decorator[] {
  if (Node.isMethodDeclaration(fn)) {
    return fn.getDecorators();
  }

  return fn
    .getModifiers()
    .filter(Node.isDecorator)
    .map((modifier) => modifier.asKindOrThrow(SyntaxKind.Decorator));
}

function readPath(decorator: Decorator): string | undefined {
  const args = decorator.getArguments();
  if (args.length === 0) {
    return undefined;
  }

  const first = args[0];

  if (Node.isStringLiteral(first) || Node.isNoSubstitutionTemplateLiteral(first)) {
    const value = first.getLiteralValue();
    if (!value) {
      return "/";
    }
    return value.startsWith("/") ? value : `/${value}`;
  }

  throw new Error(`Unsupported path expression: ${first.getText()}`);
}

function readFirebaseAuth(decorator: Decorator): RoutesManifestRoute["auth"] {
  const args = decorator.getArguments();
  if (args.length === 0) {
    return { type: "firebase" };
  }

  const options = args[0];

  if (!Node.isObjectLiteralExpression(options)) {
    throw new Error("@FirebaseAuth() only supports object literal options");
  }

  let optional: boolean | undefined;
  let roles: string[] | undefined;

  for (const prop of options.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) {
      continue;
    }

    const name = prop.getName();
    const initializer = prop.getInitializer();
    if (!initializer) {
      continue;
    }

    if (name === "optional") {
      if (initializer.getKind() === SyntaxKind.TrueKeyword) {
        optional = true;
      } else if (initializer.getKind() === SyntaxKind.FalseKeyword) {
        optional = false;
      } else {
        throw new Error("@FirebaseAuth({ optional }) expects a boolean literal");
      }
    }

    if (name === "roles") {
      if (!Node.isArrayLiteralExpression(initializer)) {
        throw new Error("@FirebaseAuth({ roles }) expects an array literal");
      }
      roles = initializer.getElements().map((element) => {
        if (!Node.isStringLiteral(element) && !Node.isNoSubstitutionTemplateLiteral(element)) {
          throw new Error("@FirebaseAuth roles must be string literals");
        }
        return element.getLiteralValue();
      });
    }
  }

  const auth: RoutesManifestRoute["auth"] = {
    type: "firebase",
  };

  if (typeof optional === "boolean") {
    auth.optional = optional;
  }

  if (roles && roles.length > 0) {
    auth.roles = roles;
  }

  return auth;
}

function inferPathFromName(fn: FunctionDeclaration | MethodDeclaration): string | undefined {
  const name = fn.getName();
  if (!name) {
    return undefined;
  }
  const slug = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
  return `/${slug}`;
}

function printUsage(): void {
  stdout.write(`Usage: sst-http <command> [options]\n`);
  stdout.write(`\nCommands:\n`);
  stdout.write(`  scan            Scan for decorated routes and emit a manifest\n`);
  stdout.write(`\nOptions for scan:\n`);
  stdout.write(`  --glob, -g      Glob pattern to include (repeatable). Defaults to src/**/*.ts\n`);
  stdout.write(`  --out, -o       Output file for the manifest. Defaults to routes.manifest.json\n`);
  stdout.write(`  --project, -p   Path to a tsconfig.json used to resolve source files\n`);
  stdout.write(`  --infer-name    Infer missing paths from function names (kebab-case)\n`);
}

main().catch((error) => {
  stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
