from token import NUMBER, DOT, DEDENT, INDENT
from blocks_tokenize import TokenInfo


class TokenIterator:
    def __init__(self, tokengen):
        self.tokengen = tokengen
        self.pending_tokens = []

    def __iter__(self):
        self.tokengen.__iter__()
        return self

    def next_token(self):
        if (self.pending_tokens):
            return self.pending_tokens.pop(0)
        token = next(self.tokengen)
        while token.type in [DEDENT, INDENT]:
            token = next(self.tokengen)
        return token

    def check_number(self, token):
        if token.type == NUMBER and '.' in token.string:
            integers = [x for x in token.string.split('.') if x != '']
            first_number = integers[0]
            end_first = [token.start[0], token.start[1]+len(first_number)]
            first = TokenInfo(NUMBER, first_number, token.start, end_first, token.line)
            dot = TokenInfo(DOT, '.', end_first, [end_first[0], end_first[1]+1], token.line)
            if len(integers) > 1:
                self.pending_tokens.append(dot)
                second_number = integers[1]
                second = TokenInfo(NUMBER, second_number,
                                   [end_first[0], end_first[1]+1],
                                   [end_first[0], end_first[1]+1+len(second_number)], token.line)
                self.pending_tokens.append(second)
                return first
            else:
                if (token.string[0] == '.'):
                    self.pending_tokens.append(first)
                    return dot
                self.pending_tokens.append(dot)
                return first
        else:
            return None

    def actual_token(self, token):
        number = self.check_number(token)
        if number is not None:
            return number
        return token

    def __next__(self):
        token = self.next_token()
        token = self.actual_token(token)
        return token


class BlocksSyntaxError(Exception):
    def __init__(self, message):
        super().__init__(f'SyntaxError: {message}')


def syntax_error(parser, message, expr=None):
    raise parser.make_syntax_error(message)
