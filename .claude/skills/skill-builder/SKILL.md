---
name: "Skill Builder"
description: "Create new Claude Code Skills with proper YAML frontmatter, progressive disclosure structure, and complete directory organization. Use when you need to build custom skills for specific workflows, generate skill templates, or understand the Claude Skills specification."
---

# Skill Builder

## What This Skill Does

Creates production-ready Claude Code Skills with proper YAML frontmatter, progressive disclosure architecture, and complete file/folder structure. This skill guides you through building skills that Claude can autonomously discover and use across all surfaces.

## Prerequisites

- Claude Code 2.0+ or Claude.ai with Skills support
- Basic understanding of Markdown and YAML

## Quick Start

```bash
# 1. Create skill directory (MUST be at top level, NOT in subdirectories!)
mkdir -p ~/.claude/skills/my-first-skill

# 2. Create SKILL.md with proper format
cat > ~/.claude/skills/my-first-skill/SKILL.md << 'EOF'
---
name: "My First Skill"
description: "Brief description of what this skill does and when Claude should use it. Maximum 1024 characters."
---

# My First Skill

## What This Skill Does
[Your instructions here]
EOF
```

## Complete Specification

### YAML Frontmatter (REQUIRED)

Every SKILL.md **must** start with YAML frontmatter containing exactly two required fields:

```yaml
---
name: "Skill Name"                    # REQUIRED: Max 64 chars
description: "What this skill does    # REQUIRED: Max 1024 chars
and when Claude should use it."       # Include BOTH what & when
---
```

**`name`**: Human-friendly display name, max 64 chars, Title Case.

**`description`**: MUST include (1) what the skill does and (2) when Claude should invoke it. Max 1024 chars.

### Directory Structure

**IMPORTANT**: Skills MUST be directly under `~/.claude/skills/[skill-name]/`. Claude Code does NOT support nested subdirectories!

```
~/.claude/skills/
└── my-skill/
    ├── SKILL.md          # REQUIRED
    ├── scripts/          # Optional: Executable scripts
    ├── resources/        # Optional: Templates, examples
    └── docs/             # Optional: Additional docs
```

### Progressive Disclosure Architecture

Claude Code uses a 3-level system:

1. **Metadata** (~200 chars): Loaded at startup for ALL skills - enable autonomous matching
2. **SKILL.md Body** (~1-10KB): Loaded only when skill is triggered
3. **Referenced Files**: Loaded on-demand as needed

This allows 100+ skills with minimal context overhead (~6KB).

## Writing Effective Descriptions

```yaml
# Good: Keywords first, clear "when" clause
description: "Generate TypeScript interfaces from JSON schema. Use when converting schemas, creating types, or building API clients."

# Bad: No trigger conditions
description: "This skill helps with JSON schemas."
```

## Validation Checklist

- [ ] Starts with `---`
- [ ] Contains `name` field (max 64 chars)
- [ ] Contains `description` field (max 1024 chars)
- [ ] Description includes "what" and "when"
- [ ] Ends with `---`
- [ ] Directory is DIRECTLY in `~/.claude/skills/[skill-name]/`
- [ ] Uses clear, descriptive directory name

## Official Resources

- [Anthropic Agent Skills Documentation](https://docs.claude.com/en/docs/agents-and-tools/agent-skills)
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code)
