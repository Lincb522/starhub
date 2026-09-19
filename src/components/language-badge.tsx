import Image from "next/image";
import { Code2 } from "lucide-react";

const LANGUAGE_ICON_SLUGS: Record<string, string> = {
  abap: "abap",
  actionscript: "actionscript",
  ada: "ada",
  "altium designer": "altium-designer",
  antlr: "antlr",
  "asp.net": "aspnet",
  assembly: "assembly",
  astro: "astro",
  autohotkey: "autohotkey",
  bash: "bash",
  c: "c",
  "c++": "cpp",
  "c#": "csharp",
  chapel: "chapel",
  clojure: "clojure",
  "common lisp": "common-lisp",
  "common workflow language": "cwl",
  crystal: "crystal",
  css: "css",
  cuda: "cuda",
  d: "d",
  dart: "dart",
  dockerfile: "dockerfile",
  edge: "edge",
  elixir: "elixir",
  elm: "elm",
  "emacs lisp": "emacs",
  erlang: "erlang",
  "f#": "fsharp",
  fish: "fish",
  fortran: "fortran",
  gherkin: "cucumber",
  go: "go",
  gradle: "gradle",
  graphql: "graphql",
  groovy: "groovy",
  gtkrc: "gtk",
  handlebars: "handlebars",
  haskell: "haskell",
  haxe: "haxe",
  hcl: "terraform",
  html: "html",
  java: "java",
  javascript: "javascript",
  "jetbrains mps": "jetbrains-mps",
  jinja: "django",
  json: "json",
  julia: "julia",
  "jupyter notebook": "jupyter-notebook",
  kotlin: "kotlin",
  lean: "lean",
  less: "less",
  lua: "lua",
  markdown: "markdown",
  mdx: "mdx",
  matlab: "matlab",
  nginx: "nginx",
  nim: "nim",
  nix: "nix",
  numpy: "numpy",
  "objective-c": "objective-c",
  "objective-c++": "objective-c",
  ocaml: "ocaml",
  "open policy agent": "open-policy-agent",
  perl: "perl",
  php: "php",
  "pov-ray sdl": "pov-ray",
  powershell: "powershell",
  pug: "pug",
  puppet: "puppet",
  purescript: "purescript",
  python: "python",
  r: "r",
  racket: "racket",
  raku: "raku",
  reason: "reason",
  red: "red",
  robotframework: "robotframework",
  "rocq prover": "coq",
  rpc: "rpc",
  ruby: "ruby",
  rust: "rust",
  salt: "saltstack",
  sas: "sas",
  sass: "sass",
  scss: "sass",
  scala: "scala",
  shell: "shell",
  smalltalk: "squeak",
  solidity: "solidity",
  sql: "sql",
  stata: "stata",
  svelte: "svelte",
  svg: "svg",
  swift: "swift",
  tex: "tex",
  toit: "toit",
  typescript: "typescript",
  typst: "typst",
  unrealscript: "unrealscript",
  v: "v",
  vala: "vala",
  vba: "vba",
  "vim script": "vim",
  "visual basic .net": "visual-basic",
  vue: "vue",
  wikitext: "mediawiki",
  xmake: "xmake",
  xml: "xml",
  xonsh: "xonsh",
  yaml: "yaml",
  zig: "zig",
};

export function LanguageBadge({
  language,
  className = "",
}: {
  language: string | null | undefined;
  className?: string;
}) {
  if (!language) return null;

  const iconSlug = LANGUAGE_ICON_SLUGS[language.trim().toLowerCase()];

  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs font-medium leading-4 text-muted ${className}`}
      title={`主要语言：${language}`}
    >
      {iconSlug ? (
        <Image
          src={`/language-icons/${iconSlug}.png`}
          alt=""
          aria-hidden
          width={16}
          height={16}
          className="size-4 shrink-0 object-contain"
        />
      ) : (
        <Code2 aria-hidden className="size-3.5 shrink-0 text-faint" strokeWidth={1.75} />
      )}
      <span className="truncate">{language}</span>
    </span>
  );
}
