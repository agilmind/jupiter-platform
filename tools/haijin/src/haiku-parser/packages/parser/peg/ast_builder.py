import ast

class Builder:

    def __init__(self):
        self.blocks = []
        self.imports = []
        self.utils = Utils()

    def root(self, definitions):
        return {
            "tree": definitions,
            "blocks": self.blocks,
            "imports": self.imports,
        }

    def _token_json(self, token):
        return {
            'string': token.string,
            'start': list(token.start),
            'end': list(token.end),
            'line': self._token_line(token.line),
        }

    def _token_line(self, line):
        return line[:-1] if line[-1] == '\n' else line

    def _build_string_value_and_token(self, tokens):
        raw_str = ''.join([t.string[1:-1] for t in tokens])
        value = self._normalize_string_value(raw_str)
        token = {
            'string': ''.join([t.string for t in tokens]),
            'start': tokens[0].start,
            'end': tokens[-1].end,
            'line': self._token_line(tokens[0].line),
        }
        return value, token

    def _normalize_string(self, token):
        return self._normalize_string_value(token.string[1:-1])

    def _normalize_string_value(self, raw_str):
        return ast.literal_eval(f'"{raw_str}"')

    def root_block(self, block):
        self.blocks.append(block)
        return block

    def build_block(self, name, value, blocks):
        new_block = {
            "type": "block",
            "name": name.string,
            'token': self._token_json(name),
            "value": value,
            "blocks": blocks or [],
        }
        return new_block

    def build_import(self, from_, members):
        new_import = {
            "type": "import",
            "from": {
                "value": from_.string.strip('\'"'),
                "token": self._token_json(from_),
            },
            "members": members,
        }
        self.imports.append(new_import)
        return new_import

    def build_import_member(self, name, alias):
        return {
            "name": {
                "value": name.string,
                "token": self._token_json(name),
            },
            "alias": {
                "value": alias.string,
                "token": self._token_json(alias)
            } if alias else None,
        }

    def build_block_alias(self, name, value):
        new_alias = {
            "type": "blockAlias",
            "name": {
                "value": name.string,
                "token": self._token_json(name),
            },
            "value": value,
        }
        self.blocks.append(new_alias)
        return new_alias

    def build_identifier(self, token):
        return {
            'type': 'identifier',
            'name': token.string,
            'token': self._token_json(token),
        }

    def build_literal_identifier(self, name, token):
        return {
            'type': 'literalIdentifier',
            'name': name.string,
            'token': self._token_json(token),
        }

    def build_call(self, callee, args_and_kwargs, token):
        args = []
        kwargs = []
        for a in args_and_kwargs:
            if isinstance(a, tuple):
                kwargs.append({'name': a[0].string, 'token': self._token_json(a[0]), 'value': a[1]})
            else:
                args.append(a)
        return {
            'type': 'call',
            'callee': callee,
            'token': self._token_json(token),
            'args': args,
            'kwargs': kwargs,
        }

    def build_string_literal(self, tokens):
        (value, token) = self._build_string_value_and_token(tokens)
        return {
            'type': 'stringLiteral',
            'value': value,
            'token': token,
        }

    def build_number_literal(self, token):
        return {
            'type': 'numberLiteral',
            'value': token.string,
            'token': self._token_json(token),
        }

    def build_boolean_literal(self, token, value):
        return {
            'type': 'booleanLiteral',
            'value': value,
            'token': self._token_json(token),
        }

    def build_list(self, elements, token):
        return {
            'type': 'listLiteral',
            'elements': elements,
            'token': self._token_json(token),
        }


class Utils:
    def flatten(self, l):
        flat = []
        for e in l:
            if isinstance(e, list):
                flat.extend(self.flatten(e))
            else:
                flat.append(e)
        return flat
