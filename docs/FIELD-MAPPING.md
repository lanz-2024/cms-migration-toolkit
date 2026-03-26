# Field Type Mapping: Craft CMS to Payload CMS

## Complete Mapping Table

| Craft Field Type | Payload Field Type | Notes |
|-----------------|-------------------|-------|
| `craft:PlainText` | `text` | Direct 1:1 mapping |
| `craft:RichText` | `richText` | HTML string → Payload Lexical/Slate format |
| `craft:Number` | `number` | No conversion needed |
| `craft:Date` | `date` | ISO 8601 string preserved |
| `craft:Lightswitch` | `checkbox` | Boolean value preserved |
| `craft:Checkboxes` | `checkbox` | Multi-value → array of strings |
| `craft:Dropdown` | `select` | Options array mapped from field config |
| `craft:RadioButtons` | `radio` | Options array mapped from field config |
| `craft:Email` | `email` | Validated on import |
| `craft:Url` | `text` | No Payload `url` type; stored as text |
| `craft:Color` | `text` | Hex string preserved |
| `craft:Assets` | `upload` | Asset URLs resolved; files re-uploaded to Payload media |
| `craft:Entries` | `relationship` | Entry IDs mapped to Payload document IDs |
| `craft:Categories` | `relationship` | Category IDs → Payload taxonomy relationships |
| `craft:Tags` | `array` | Tag names → array of string values |
| `craft:Matrix` | `blocks` | Block types mapped individually; see Matrix Mapping below |
| `craft:SuperTable` | `array` | Rows mapped to array of objects |
| `craft:Table` | `array` | Rows and columns preserved as array |
| Unknown type | `text` | Fallback with warning logged |

## Rich Text Conversion

Craft stores rich text as HTML strings. Payload CMS uses a structured editor format (Lexical by default, Slate in older versions). The toolkit converts HTML to Payload's editor JSON using the `@payloadcms/richtext-lexical` HTML deserializer.

Supported HTML elements:
- Headings: `h1`–`h6`
- Paragraphs: `p`
- Inline: `strong`, `em`, `u`, `s`, `code`
- Links: `a` (href preserved)
- Lists: `ul`, `ol`, `li`
- Code blocks: `pre > code`
- Blockquotes: `blockquote`

Unsupported elements (e.g. custom Craft embed tags) are converted to plain text with a warning.

## Matrix Block Mapping

Craft Matrix fields contain typed block types. Each block type is mapped to a Payload block definition:

```
Craft Matrix
└─ blockType: "textBlock"   →  Payload blocks array item { blockType: "textBlock", ... }
└─ blockType: "imageBlock"  →  Payload blocks array item { blockType: "imageBlock", ... }
```

Block field types within each block are mapped using the same field type table above.

## Asset Handling

Craft asset fields contain file metadata (URL, dimensions, alt text). The toolkit:

1. Downloads the file from the Craft CDN URL
2. Uploads it to the Payload media collection via `POST /api/media`
3. Replaces the Craft asset ID with the new Payload document ID in the entry

Asset download is rate-limited (max 3 concurrent downloads) to avoid overwhelming the source CDN.

## Relationship ID Mapping

Craft entry IDs are integers; Payload document IDs are strings (MongoDB ObjectIDs or UUIDs depending on configuration). The toolkit maintains an ID map file (`checkpoints/id-map.json`) that records:

```json
{
  "craft:101": "payload:64f8a2b3c1d2e3f4a5b6c7d8",
  "craft:102": "payload:64f8a2b3c1d2e3f4a5b6c7d9"
}
```

Relationship fields are rewritten using this map after all entries are loaded.
