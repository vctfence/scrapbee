import sys
import regex


def module_property(func):
    """Decorator to turn module functions into properties.
    Function names must be prefixed with an underscore."""
    module = sys.modules[func.__module__]

    def base_getattr(name):
        raise AttributeError(
            f"module '{module.__name__}' has no attribute '{name}'")

    old_getattr = getattr(module, '__getattr__', base_getattr)

    def new_getattr(name):
        if f'_{name}' == func.__name__:
            return func()
        else:
            return old_getattr(name)

    module.__getattr__ = new_getattr
    return func


def index_text(string):
    string = string.replace("\n", " ")
    string = regex.sub(r"(?:\p{Z}|[^\p{L}-])+", " ", string)
    words = string.split(" ")
    words = [w.lower() for w in words if len(w) > 2]
    return words
