// Haiku Grammar

// Utility rules for whitespace handling
_ = [ \t]*
__ = [ \t]+
EOL = "\n" / "\r\n"
INDENT = "    " / "\t"
DEDENT = ""

// Main rules
start
  = grammar EOL? EOF

grammar
  = metas:meta* rules:rule+ {
      return {
        type: "Grammar",
        metas,
        rules
      }
    }

meta
  = "@" name:identifier value:(__ identifier / __ string)? EOL {
      return {
        type: "Meta",
        name,
        value: value ? value[1] : null
      }
    }

rule
  = name:rulename memo:memoflag? ":" _ alternatives:alternatives EOL indent:INDENT more:moreAlternatives DEDENT {
      return {
        type: "Rule",
        name,
        memo,
        alternatives: alternatives.concat(more)
      }
    }
  / name:rulename memo:memoflag? ":" _ alternatives:alternatives EOL {
      return {
        type: "Rule",
        name,
        memo,
        alternatives
      }
    }

rulename
  = name:identifier annotation:annotation? {
      return {
        name,
        annotation
      }
    }

memoflag
  = "(" _ "memo" _ ")" {
      return "memo"
    }

alternatives
  = first:alternative rest:(_ "|" _ alternative)* {
      return [first].concat(rest.map(r => r[3]))
    }

moreAlternatives
  = alternatives:("|" _ alternatives EOL)* {
      return [].concat(...alternatives.map(a => a[2]))
    }

alternative
  = elements:element+ action:action? {
      return {
        type: "Alternative",
        elements,
        action
      }
    }
  / elements:element+ "$" {
      return {
        type: "Alternative",
        elements: elements.concat([{
          type: "NamedItem",
          name: null,
          item: { type: "NameLeaf", value: "ENDMARKER" }
        }])
      }
    }

element
  = name:identifier annotation:annotation? "=" _ item:item {
      return {
        type: "NamedItem",
        name,
        annotation,
        item
      }
    }
  / item:item {
      return {
        type: "NamedItem",
        name: null,
        item
      }
    }
  / item:forcedAtom {
      return {
        type: "NamedItem",
        name: null,
        item
      }
    }
  / item:lookahead {
      return {
        type: "NamedItem",
        name: null,
        item
      }
    }

forcedAtom
  = "&&" _ atom:atom {
      return {
        type: "Forced",
        atom
      }
    }

lookahead
  = "&" _ atom:atom {
      return {
        type: "PositiveLookahead",
        atom
      }
    }
  / "!" _ atom:atom {
      return {
        type: "NegativeLookahead",
        atom
      }
    }
  / "~" {
      return {
        type: "Cut"
      }
    }

item
  = "[" _ alts:alternatives _ "]" {
      return {
        type: "Optional",
        alternatives: alts
      }
    }
  / atom:atom "?" {
      return {
        type: "Optional",
        atom
      }
    }
  / atom:atom "*" {
      return {
        type: "Repeat0",
        atom
      }
    }
  / atom:atom "+" {
      return {
        type: "Repeat1",
        atom
      }
    }
  / sep:atom "." node:atom "+" {
      return {
        type: "Gather",
        separator: sep,
        node
      }
    }
  / atom

atom
  = "(" _ alts:alternatives _ ")" {
      return {
        type: "Group",
        alternatives: alts
      }
    }
  / name:identifier {
      return {
        type: "NameLeaf",
        value: name
      }
    }
  / string:string {
      return {
        type: "StringLeaf",
        value: string
      }
    }

// Action and annotation rules
action
  = "{" content:target_atoms "}" {
      return content.join(" ")
    }

annotation
  = "[" content:target_atoms "]" {
      return content.join(" ")
    }

target_atoms
  = atoms:target_atom+ {
      return atoms
    }

target_atom
  = "{" atoms:target_atoms? "}" {
      return "{" + (atoms ? atoms.join(" ") : "") + "}"
    }
  / "[" atoms:target_atoms? "]" {
      return "[" + (atoms ? atoms.join(" ") : "") + "]"
    }
  / name:identifier "*" {
      return name + "*"
    }
  / identifier
  / number
  / string
  / "?"
  / ":"
  / op:$([+\-*/%<>=!&|]+) {
      return op
    }

// Basic tokens
identifier = name:$([a-zA-Z_][a-zA-Z0-9_]*) {
    return name
}

//string = quote:['"'] content:$([^'"]*) quote {
//    return content
//}

number = digits:$([0-9]+) {
    return digits
}

EOF = !.
