# Configuration Guide

Complete reference for configuring the OpenCode OpenAI Codex Auth Plugin.

## Quick Reference

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-openai-codex-auth"],
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "medium",
        "reasoningSummary": "auto",
        "textVerbosity": "medium",
        "include": ["reasoning.encrypted_content"],
        "store": false
      },
      "models": {
        "gpt-5.1-codex-low": {
          "name": "GPT 5.1 Codex Low (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "options": {
            "reasoningEffort": "low",
            "reasoningSummary": "auto",
            "textVerbosity": "medium",
            "include": ["reasoning.encrypted_content"],
            "store": false
          }
        }
      }
    }
  }
}
```

---

## Configuration Options

### serviceTier

The service tier is independent of `reasoningEffort`. Fast remains off unless you select it.

- `priority`: Fast service. OpenAI describes this tier as faster with increased usage.
- `fast`: Alias for `priority`.
- `default`: Standard service. The plugin omits `service_tier`, as Codex does, even if a lower-priority configuration requests Fast.
- `auto` and `flex`: Pass through to the backend. Availability depends on the model and account.

Precedence is the request's `service_tier`, then `providerOptions.openai.serviceTier`, then model `options`, then global `options`.
An absent tier uses standard service. Invalid values also use standard service, with a warning when plugin debug logging is enabled.

The OAuth plugin preserves tier and reasoning selections before SDK serialization, including older SDK versions that discard options for unknown models.
It removes its private metadata before the backend request and leaves API-key requests unchanged.

The modern preset and automatic Astra registration include a `fast` variant with `serviceTier: "priority"`.
The legacy preset includes `gpt-6-astra-fast`, which maps to the backend model `gpt-6-astra`.
The legacy name alone does not select a service tier; its preset `options` supply the tier.

For Fast with high reasoning, add this variant to your existing Astra configuration:

```json
{
  "provider": {
    "openai": {
      "models": {
        "gpt-6-astra": {
          "variants": {
            "high-fast": {
              "reasoningEffort": "high",
              "serviceTier": "priority"
            }
          }
        }
      }
    }
  }
}
```

After you install the rebuilt plugin or change configuration, quit and restart OpenCode.

### Astra Instructions

The plugin extracts Astra's instructions from `codex-rs/models-manager/models.json` in the latest OpenAI Codex release.
It selects `gpt-6-astra` and uses `model_messages.instructions_template`, not the GPT-5.1 prompt.
The dedicated cache is `~/.opencode/cache/gpt-6-astra-instructions.md`, with a 15-minute freshness interval and ETag checks.
If retrieval fails or the template is invalid, the plugin uses cached Astra instructions or the bundled official Astra prompt.
The build includes the bundled prompt, so first use without GitHub access does not require a previous cache.

### reasoningEffort

Controls computational effort for reasoning.

**GPT-5.2 Values** (per OpenAI API docs and Codex CLI `ReasoningEffort` enum):
- `none` - No dedicated reasoning phase (disables reasoning)
- `low` - Light reasoning
- `medium` - Balanced (default)
- `high` - Deep reasoning
- `xhigh` - Extra depth for long-horizon tasks

**GPT-5.2-Codex Values:**
- `low` - Fastest for code
- `medium` - Balanced (default)
- `high` - Maximum code quality
- `xhigh` - Extra depth for long-horizon tasks

**GPT-5.1 Values** (per OpenAI API docs and Codex CLI `ReasoningEffort` enum):
- `none` - No dedicated reasoning phase (disables reasoning)
- `low` - Light reasoning
- `medium` - Balanced (default)
- `high` - Deep reasoning

**GPT-5.1-Codex / GPT-5.1-Codex-Max Values:**
- `low` - Fastest for code
- `medium` - Balanced (default)
- `high` - Maximum code quality
- `xhigh` - Extra depth (Codex Max only)

**GPT-5.1-Codex-Mini Values:**
- `medium` - Balanced (default)
- `high` - Maximum code quality

**Notes**:
- `none` is supported for GPT-5.2 and GPT-5.1 (general purpose) per OpenAI API documentation
- `none` is NOT supported for Codex variants (including GPT-5.2 Codex) - it auto-converts to `low` for Codex/Codex Max or `medium` for Codex Mini
- `minimal` auto-converts to `low` for Codex models
- `xhigh` is supported for GPT-5.2, GPT-5.2 Codex, and GPT-5.1-Codex-Max; other models downgrade to `high`
- Codex Mini only supports `medium` or `high`; lower settings clamp to `medium`

**Example:**
```json
{
  "options": {
    "reasoningEffort": "high"
  }
}
```

### reasoningSummary

Controls reasoning summary verbosity.

**Values:**
- `auto` - Automatically adapts (default)
- `concise` - Short summaries
- `detailed` - Verbose summaries
- `off` - Disable reasoning summary (Codex Max supports)
- `on` - Force enable summary (Codex Max supports)

**Example:**
```json
{
  "options": {
    "reasoningSummary": "detailed"
  }
}
```

### textVerbosity

Controls output length.

**GPT-5 Values:**
- `low` - Concise
- `medium` - Balanced (default)
- `high` - Verbose

**GPT-5.2-Codex / GPT-5.1-Codex / Codex Max:**
- `medium` or `high` (Codex Max defaults to `medium`)

**Example:**
```json
{
  "options": {
    "textVerbosity": "high"
  }
}
```

### include

Array of additional response fields to include.

**Default**: `["reasoning.encrypted_content"]`

**Why needed**: Enables multi-turn conversations with `store: false` (stateless mode)

**Example:**
```json
{
  "options": {
    "include": ["reasoning.encrypted_content"]
  }
}
```

### store

Controls server-side conversation persistence.

**⚠️ Required**: `false` (for AI SDK 2.0.50+ compatibility)

**Values:**
- `false` - Stateless mode (required for Codex API)
- `true` - Server-side storage (not supported by Codex API)

**Why required:**
AI SDK 2.0.50+ automatically uses `item_reference` items when `store: true`. The Codex API requires stateless operation (`store: false`), where references cannot be resolved.

**Example:**
```json
{
  "options": {
    "store": false
  }
}
```

**Note:** The plugin automatically injects this via a `chat.params` hook, but explicit configuration is recommended for clarity.

---

## Configuration Patterns

### Pattern 1: Global Options

Apply same settings to all models:

```json
{
  "plugin": ["opencode-openai-codex-auth"],
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "high",
        "textVerbosity": "high",
        "store": false
      }
    }
  }
}
```

**Use when**: You want consistent behavior across all models.

### Pattern 2: Per-Model Options

Different settings for different models:

```json
{
  "plugin": ["opencode-openai-codex-auth"],
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "medium",
        "store": false
      },
      "models": {
        "gpt-5-codex-fast": {
          "name": "Fast Codex",
          "options": {
            "reasoningEffort": "low",
            "store": false
          }
        },
        "gpt-5-codex-smart": {
          "name": "Smart Codex",
          "options": {
            "reasoningEffort": "high",
            "reasoningSummary": "detailed",
            "store": false
          }
        }
      }
    }
  }
}
```

**Use when**: You want quick-switch presets for different tasks.

**Precedence**: Model options override global options.

### Pattern 3: Config Key vs Name

**Understanding the fields:**

```json
{
  "models": {
    "my-custom-id": {           // ← Config key (used everywhere)
      "name": "My Display Name",  // ← Shows in TUI
      "options": { ... }
    }
  }
}
```

- **Config key** (`my-custom-id`): Used in CLI, config lookups, TUI persistence
- **`name` field**: Friendly display name in model selector
- **`id` field**: DEPRECATED - not used by OpenAI provider

**Example Usage:**
```bash
# Use the config key in CLI
opencode run "task" --model=openai/my-custom-id

# TUI shows: "My Display Name"
```

> **⚠️ Recommendation:** Stick to the official presets in `opencode-modern.json` (v1.0.210+) or `opencode-legacy.json` rather than creating custom model variants. GPT 5 models need specific configurations to work reliably.

See [development/CONFIG_FIELDS.md](development/CONFIG_FIELDS.md) for complete explanation.

---

## Advanced Scenarios

### Scenario: Quick Switch Presets

Create named variants for common tasks:

```json
{
  "models": {
    "codex-quick": {
      "name": "⚡ Quick Code",
      "options": {
        "reasoningEffort": "low",
        "store": false
      }
    },
    "codex-balanced": {
      "name": "⚖️ Balanced Code",
      "options": {
        "reasoningEffort": "medium",
        "store": false
      }
    },
    "codex-quality": {
      "name": "🎯 Max Quality",
      "options": {
        "reasoningEffort": "high",
        "reasoningSummary": "detailed",
        "store": false
      }
    }
  }
}
```

### Scenario: Per-Agent Models

Different agents use different models:

```json
{
  "agent": {
    "commit": {
      "model": "openai/gpt-5.1-codex-low",
      "prompt": "Generate concise commit messages"
    },
    "review": {
      "model": "openai/gpt-5.1-codex-high",
      "prompt": "Thorough code review"
    }
  }
}
```

### Scenario: Project-Specific Overrides

Global config has defaults, project overrides for specific work:

**~/.config/opencode/opencode.jsonc** (global, preferred):
```json
{
  "plugin": ["opencode-openai-codex-auth"],
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "medium",
        "store": false
      }
    }
  }
}
```

**my-project/.opencode.json** (project):
```json
{
  "provider": {
    "openai": {
      "options": {
        "reasoningEffort": "high",
        "store": false
      }
    }
  }
}
```

Result: Project uses `high`, other projects use `medium`.

---

## Plugin Configuration

Advanced plugin settings in `~/.opencode/openai-codex-auth-config.json`:

```json
{
  "codexMode": true
}
```

### CODEX_MODE

**What it does:**
- `true` (default): Uses Codex-OpenCode bridge prompt (Task tool & MCP aware)
- `false`: Uses legacy tool remap message
- Bridge prompt content is synced with the latest Codex CLI release (ETag-cached)

**When to disable:**
- Compatibility issues with OpenCode updates
- Testing different prompt styles
- Debugging tool call issues

**Override with environment variable:**
```bash
CODEX_MODE=0 opencode run "task"  # Temporarily disable
CODEX_MODE=1 opencode run "task"  # Temporarily enable
```

### Prompt caching

- When OpenCode provides a `prompt_cache_key` (its session identifier), the plugin forwards it directly to Codex.
- The same value is sent via headers (`conversation_id`, `session_id`) and request body, reducing latency and token usage.
- The plugin does not synthesize a fallback key; hosts that omit `prompt_cache_key` will see uncached behaviour until they provide one.
- No configuration needed—cache headers are injected during request transformation.

### Usage limit messaging

- When the ChatGPT subscription hits a limit, the plugin returns a Codex CLI-style summary (5-hour + weekly windows).
- Messages bubble up in OpenCode exactly where SDK errors normally surface.
- Helpful when working inside the OpenCode UI or CLI—users immediately see reset timing.

---

## Configuration Files

**Provided Examples:**
- [config/opencode-modern.json](../config/opencode-modern.json) - Variants-based config for OpenCode v1.0.210+
- [config/opencode-legacy.json](../config/opencode-legacy.json) - Legacy full list for v1.0.209 and below

> **⚠️ REQUIRED:** You MUST use the config that matches your OpenCode version (`opencode-modern.json` or `opencode-legacy.json`). Minimal configs are NOT supported for GPT 5 models and will fail unpredictably. OpenCode's auto-compaction and usage widgets also require the full config's per-model `limit` metadata.

**Your Configs:**
- `~/.config/opencode/opencode.jsonc` - Global config (preferred)
- `~/.config/opencode/opencode.json` - Global config (fallback)
- `<project>/.opencode.json` - Project-specific config
- `~/.opencode/openai-codex-auth-config.json` - Plugin config

---

## Validation

### Check Config is Valid

```bash
# OpenCode will show errors if config is invalid
opencode
```

### Verify Model Resolution

```bash
# Enable debug logging
DEBUG_CODEX_PLUGIN=1 opencode run "test" --model=openai/your-model-name
```

Look for:
```
[openai-codex-plugin] Model config lookup: "your-model-name" → normalized to "gpt-5-codex" for API {
  hasModelSpecificConfig: true,
  resolvedConfig: { ... }
}
```

### Test Per-Model Options

```bash
# Run with different models, check logs show different options
ENABLE_PLUGIN_REQUEST_LOGGING=1 opencode run "test" --model=openai/gpt-5-codex-low
ENABLE_PLUGIN_REQUEST_LOGGING=1 opencode run "test" --model=openai/gpt-5-codex-high

# Compare reasoning.effort in logs
cat ~/.opencode/logs/codex-plugin/request-*-after-transform.json | jq '.reasoning.effort'
```

---

## Migration Guide

### From Old Config Names

Old verbose names still work:

**⚠️ IMPORTANT:** Old configs with GPT 5.0 models are deprecated. You MUST migrate to the new GPT 5.x configs (`opencode-modern.json` or `opencode-legacy.json`).

**Old config (deprecated):**
```json
{
  "models": {
    "gpt-5-codex-low": {
      "name": "GPT 5 Codex Low (OAuth)",
      "options": { "reasoningEffort": "low" }
    }
  }
}
```

**New config (required):**

Use the official config file (`opencode-modern.json` for v1.0.210+, `opencode-legacy.json` for older) which includes:

```json
{
  "models": {
    "gpt-5.1-codex-low": {
      "name": "GPT 5.1 Codex Low (OAuth)",
      "limit": {
        "context": 272000,
        "output": 128000
      },
      "options": {
        "reasoningEffort": "low",
        "reasoningSummary": "auto",
        "textVerbosity": "medium",
        "include": ["reasoning.encrypted_content"],
        "store": false
      }
    }
  }
}
```

**Benefits:**
- GPT 5.2/5.1 support (5.0 is deprecated)
- Proper limit metadata for OpenCode features
- Verified configuration that works reliably

---

## Common Patterns

### Pattern: Task-Based Presets

```json
{
  "models": {
    "quick-chat": {
      "name": "Quick Chat",
      "options": {
        "reasoningEffort": "minimal",
        "textVerbosity": "low",
        "store": false
      }
    },
    "code-gen": {
      "name": "Code Generation",
      "options": {
        "reasoningEffort": "medium",
        "store": false
      }
    },
    "debug-help": {
      "name": "Debug Analysis",
      "options": {
        "reasoningEffort": "high",
        "reasoningSummary": "detailed",
        "store": false
      }
    }
  }
}
```

### Pattern: Cost vs Quality

```json
{
  "models": {
    "economy": {
      "name": "Economy Mode",
      "options": {
        "reasoningEffort": "low",
        "textVerbosity": "low",
        "store": false
      }
    },
    "premium": {
      "name": "Premium Mode",
      "options": {
        "reasoningEffort": "high",
        "textVerbosity": "high",
        "store": false
      }
    }
  }
}
```

---

## Troubleshooting Config

### Model Not Found

**Error**: `Model 'openai/my-model' not found`

**Cause**: Config key doesn't match model name in command

**Fix**: Use exact config key:
```json
{ "models": { "my-model": { ... } } }
```
```bash
opencode run "test" --model=openai/my-model  # Must match exactly
```

### Per-Model Options Not Applied

**Check**: Is config key used for lookup?

```bash
DEBUG_CODEX_PLUGIN=1 opencode run "test" --model=openai/your-model
```

Look for `hasModelSpecificConfig: true` in debug output.

### Options Ignored

**Cause**: Model normalizes before lookup

**Example Problem:**
```json
{ "models": { "gpt-5.1-codex": { "options": { ... } } } }
```
```bash
--model=openai/gpt-5.1-codex-low  # Normalizes to "gpt-5.1-codex" before lookup
```

**Fix**: Use exact name you specify in CLI as config key.

> **⚠️ Best Practice:** Use the official `opencode-modern.json` or `opencode-legacy.json` configuration instead of creating custom configs. This ensures proper model normalization and compatibility with GPT 5 models.

---

**Next**: [Troubleshooting](troubleshooting.md) | [Back to Documentation Home](index.md)
