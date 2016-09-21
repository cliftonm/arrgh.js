/**
 * @namespace arrgh
 */
 var arrgh = (function () {
    "use strict";

    // Global types.

    /**
     * A function that is applied to each element in an enumerable.
     *
     * @callback forEachCallback
     * @param {*} element - The current element in the for loop.
     * @param {Number} index - The index of the current element.
     * @returns {bool} - Return false (or falsey, but not null or undefined) to jump out of the loop early.
     */

    /**
     * A function to test each element for a condition.
     *
     * @callback predicate
     * @param {*} element - The current element in the for loop.
     * @returns {Boolean} - Returns whether the current element satisfies the condition.
     */

     /**
     * A function that projects an element into a new form.
     *
     * @callback selector
     * @param {*} element - The current element in the for loop.
     * @returns {*} - A projection of the current element.
     */

    /**
     * A function that returns the key value from an element.
     *
     * @callback keySelector
     * @param {*} element - The current element in the for loop.
     * @returns {*} - The value of the key for the current element.
     */

    /**
     * A function that tests if two elements are equal.
     * @callback equals
     * @param {*} x - The element to test for equality.
     * @param {*} y - The element to test on.
     * @returns {Boolean} - Return whether the elements are equal.
     */

    /**
     * Returns a hash code for the specified object.
     * @callback getHash
     * @param {*} obj - The object for which a hash code is to be returned.
     * @returns {String} - A hash code for the specified object.
     */

    /**
     * Defines methods to support the comparison of objects for equality.
     * @name equalityComparer
     * @type {Object}
     * @property {equals} [equals=(===)] - A function that tests if two elements are equal.
     * @property {getHash} [getHash=getHash() || toString()] - A function that computes an element's hash code.
     */

    // Collections
    var Enumerable;
    var List;
    var Dictionary;
    var OrderedEnumerable;
    var Lookup;

    // Iterators
    var ArrayIterator;
    var DictionaryIterator;
    var DefaultIfEmptyIterator;
    var WhereIterator;
    var SelectIterator;
    var OrderedIterator;
    var UnionIterator;
    var ExceptIterator;

    // Helper functions
    var Temp = function () {
        // This will shut up JSLint :-)
        // Minify will remove 'return' so no precious bytes are lost.
        return;
    };
    function inherit(inheritor, inherited) {
        Temp.prototype = inherited.prototype;
        inheritor.prototype = new Temp();
        Temp.prototype = null;
        inheritor.prototype.constructor = inheritor;
    }

    function isArray(o) {
        return Object.prototype.toString.call(o) === "[object Array]";
    }

    function isNull(obj) {
        return obj === undefined || obj === null;
    }

    function alwaysTrue() {
        return true;
    }

    function identity(x) {
        return x;
    }

    var defaultEqComparer = {
        equals: function (x, y) {
            return x === y;
        },
        getHash: function (obj) {
            var hash;
            if (obj === null) {
                hash = "null";
            } else if (obj === undefined) {
                hash = "undefined";
            } else {
                hash = typeof obj.getHash === "function"
                ? obj.getHash()
                : (typeof obj.toString === "function" ? obj.toString() : Object.prototype.toString.call(obj));
            }
            return hash;
        }
    };

    function ensureEqComparer (eqComparer) {
        if (!eqComparer || eqComparer === defaultEqComparer) {
            return defaultEqComparer;
        } else if (eqComparer.equals && eqComparer.getHash) {
            return eqComparer;
        }

        var fullEqComparer;
        if (typeof eqComparer === "function") {
            fullEqComparer = {
                equals: eqComparer,
                getHash: defaultEqComparer.getHash
            };
        } else {
            fullEqComparer = {
                equals: eqComparer.equals || defaultEqComparer.equals,
                getHash: eqComparer.getHash || defaultEqComparer.getHash
            };
        }
        return fullEqComparer;
    };

    function qsort(enumerable, comparer) {
        if (enumerable.count() < 2) {
            return enumerable;
        }

        var head = enumerable.first();
        var smaller = enumerable.where(function (item, index) {
            if (index === 0) {
                return false;
            }
            if (comparer) {
                return comparer(item, head) <= 0;
            } else {
                return item <= head;
            }
        });
        var bigger = enumerable.where(function (item, index) {
            if (index === 0) {
                return false;
            }
            if (comparer) {
                return comparer(item, head) > 0;
            } else {
                return item > head;
            }
        });

        var smallerSorted = qsort(smaller, comparer);
        var biggerSorted = qsort(bigger, comparer);
        return smallerSorted.unionAll(new Enumerable([head])).unionAll(biggerSorted);
    }

    // Iterators
    ArrayIterator = function (arr) {
        var len = arr.length;
        var index = -1;
        this.moveNext = function () {
            if (arr.length !== len) {
                throw new Error("Collection was modified, enumeration operation may not execute.");
            }
            index += 1;
            return index < len;
        };
        this.current = function () {
            return arr[index];
        };
    };

    DictionaryIterator = function (dict) {
        var len = dict.length;
        var current;
        var hashIndex = -1;
        var currentKeys;
        var keyIndex = -1;
        this.moveNext = function () {
            if (dict.length !== len) {
                throw new Error("Collection was modified, enumeration operation may not execute.");
            }
            current = undefined;
            if (!currentKeys || keyIndex == currentKeys.length - 1) {
                hashIndex += 1;
                if (hashIndex < dict._.hashes.length) {
                    var hash = dict._.hashes[hashIndex];
                    currentKeys = dict._.keys[hash];
                    keyIndex = 0;
                    current = currentKeys[keyIndex];
                }
            } else {
                keyIndex += 1;
                current = currentKeys[keyIndex];
            }
            return hashIndex <= dict._.hashes.length - 1;
        };
        this.current = function () {
            return current;
        };
    };

    WhereIterator = function (source, predicate) {
        predicate = predicate || alwaysTrue;

        var index = -1;
        var iterator = source.getIterator();
        var moveNext;
        moveNext = function () {
            index += 1;
            if (iterator.moveNext()) {
                if (predicate(iterator.current(), index)) {
                    return true;
                } else {
                    return moveNext();
                }
            } else {
                return false;
            }
        };
        this.moveNext = moveNext;
        this.current = iterator.current;
    };

    DefaultIfEmptyIterator = function (source, defaultValue) {
        var iterator = source.getIterator();
        var current;
        var empty = true;
        this.moveNext = function () {
            current = undefined;
            if (iterator.moveNext()) {
                empty = false;
                current = iterator.current();
                return true;
            } else if (empty) {
                empty = false;
                current = defaultValue;
                return true;
            }
            return false;
        };
        this.current = function () {
            return current;
        };
    };

    SelectIterator = function (source, selector) {
        selector = selector || identity;

        var index = -1;
        var iterator = source.getIterator();
        var next;
        this.moveNext = function () {
            index += 1;
            next = iterator.moveNext();
            return next;
        };
        this.current = function () {
            var current;
            if (next) {
                current = selector(iterator.current(), index);
            }
            return current;
        };
    };

    OrderedIterator = (function () {
        var getNextSource = function (source, currentSource) {
            var next = source;
            while (next._.source instanceof OrderedEnumerable && next._.source !== currentSource) {
                next = next._.source;
            }
            return next;
        };
        var compare = function (a, b) {
            // Treat undefined and null as
            // smaller than anything
            // and equal to each other.
            if (!isNull(a) && isNull(b)) {
                return 1;
            } else if (isNull(a) && !isNull(b)) {
                return -1;
            } else if (isNull(a) && isNull(b)) {
                return 0;
            } else if (a > b) {
                return 1;
            } else if (a < b) {
                return -1;
            } else {
                return 0;
            }
        };
        return function (source) {
            var self = this;

            var arr;
            var len;
            var index = -1;
            self.moveNext = function () {
                if (index === -1) {
                    var parent = getNextSource(source);
                    // Make sure the source is fully evaluated by calling toArray().
                    arr = qsort(new Enumerable(parent._.source.toArray()), function (x, y) {
                        var result;
                        var cont = true;
                        var currentSource = parent;
                        while (cont) {
                            result = compare(currentSource._.keySelector(x), currentSource._.keySelector(y)) * currentSource._.descending;
                            if (result !== 0) {
                                break;
                            }
                            if (currentSource === source) {
                                cont = false;
                            } else {
                                currentSource = getNextSource(source, currentSource);
                            }
                        }
                        return result;
                    }).toArray();
                    len = arr.length;
                }
                index += 1;
                return index < len;
            };
            self.current = function () {
                return arr ? arr[index] : undefined;
            };
        };
    }());

    UnionIterator = function (first, second, eqComparer) {
        var firstIterator = first.getIterator();
        var secondIterator = second.getIterator();
        var current;
        var moveFirst = true;
        var d;
        var alreadyUnioned;
        if (eqComparer) {
            d = new Dictionary(eqComparer);

            alreadyUnioned = function (elem) {
                if (d.containsKey(elem)) {
                    return true;
                } else {
                    d.add(elem);
                    return false;
                }
            };
        }

        var moveNext;
        var move = function (iterator) {
            var hasNext = iterator.moveNext();
            if (hasNext) {
                current = iterator.current();
                if (eqComparer && alreadyUnioned(current)) {
                    return moveNext(iterator);
                }
            }
            return hasNext;
        };

        moveNext = function () {
            current = undefined;
            if (moveFirst) {
                moveFirst = move(firstIterator);
                if (!moveFirst) {
                    // If there is no next item
                    // move on to the second iterator.
                    return moveNext();
                }
                return true;
            } else {
                return move(secondIterator);
            }
        };
        this.moveNext = moveNext;
        this.current = function () {
            return current;
        };
    };

    ExceptIterator = function (source, other, eqComparer) {
        var iterator = source.getIterator();
        var d = new Dictionary(eqComparer);
        other.forEach(function (elem) {
            if (!d.containsKey(elem)) {
                d.add(elem);
            }
        });
        var moveNext;
        moveNext = function () {
            if (iterator.moveNext()) {
                if (!d.containsKey(iterator.current())) {
                    d.add(iterator.current());
                    return true;
                } else {
                    return moveNext();
                }
            }
            return false;
        };
        this.moveNext = moveNext;
        this.current = function () {
            return iterator.current();
        };
    };

    // Collections
    /**
     * Represents the base class for any collection.
     * @memberof arrgh
     * @constructor
     * @param {(array|function)} [iterator=[]] - An array to iterate over or a function that returns an iterator.
     */
     Enumerable = function () {
        var iterable;
        if (arguments.length > 1) {
            iterable = Array.prototype.slice.call(arguments);
        } else {
            iterable = arguments[0] || [];
        }

        if (isArray(iterable)) {
            this.getIterator = function () {
                return new ArrayIterator(iterable);
            };
        } else {
            this.getIterator = iterable;
        }
    };

    var empty = new Enumerable();
    Enumerable.empty = function () {
        return empty;
    };

    var enumProto = Enumerable.prototype;

    /**
     * Determines whether all elements of the collection satisfy a condition.
     * @param {predicate} predicate - A function to test each element for a condition.
     * @function all
     * @memberof arrgh.Enumerable
     * @instance
     * @returns {Boolean} - True if the list is empty or if all elements in the collection satisfy a condition, else false.
     */
     enumProto.all = function (predicate) {
        var all = true;
        this.forEach(function (elem) {
            all = predicate(elem);
            return all;
        });
        return all;
    };

    /**
     * Determines whether the collection contains any elements or if any elements satisfy a condition.
     * @param {predicate} [predicate] - A function to test each element for a condition.
     * @function any
     * @see {@link arrgh.Enumerable#some}
     * @memberof arrgh.Enumerable
     * @instance
     * @returns {Boolean} - True if the collection contains any elements or if any elements satisfy a condition, else false.
     */
     enumProto.any = function (predicate) {
        var any = false;
        this.forEach(function (elem) {
            if (predicate) {
                any = predicate(elem);
                return !any;
            } else {
                any = true;
                return false;
            }
        });
        return any;
    };

    /**
     * Determines whether the collection contains any elements or if any elements satisfy a condition.
     * @param {predicate} [predicate] - A function to test each element for a condition.
     * @function some
     * @see {@link arrgh.Enumerable#any}
     * @memberof arrgh.Enumerable
     * @instance
     * @returns {Boolean} - True if the collection contains any elements or if any elements satisfy a condition, else false.
     */
     enumProto.some = enumProto.any;

    /**
     * Computes the average of a collection of values.<br />
     * If values are not numerics the result may be NaN or something unexpected (e.g. "2" + 2 will results in an average of 11 ("2" + 2 = 22, 22 / 2 = 11)).
     * @param {selector} [selector] - A function that projects an element into a new form.
     * @function average
     * @memberof arrgh.Enumerable
     * @instance
     * @returns {Number} - The average of all values in the collection, or NaN.
     * @throws Throws an error if the collection contains no elements.
     */
     enumProto.average = function (selector) {
        selector = selector || identity;

        var sum = 0;
        var count = 0;
        this.forEach(function (elem, index) {
            sum += selector(elem);
            count += 1;
        });

        if (count === 0) {
            throw new Error("Collection contains no elements.");
        }

        return sum / count;
    };

    /**
     * Determines whether a collection contains a specified element, optionally uses a custom equality comparer.
     * @param {*} elem - The element to locate in the collection.
     * @param {equals|equalityComparer} [eqComparer=(===)] - A function or object that tests if two elements are equal.
     * @function contains
     * @memberof arrgh.Enumerable
     * @instance
     * @returns {Boolean} - Returns whether the specified element is contained in the collection.
     */
     enumProto.contains = function (elem, eqComparer) {
        eqComparer = ensureEqComparer(eqComparer);
        var hasElem = false;
        this.forEach(function (item) {
            hasElem = eqComparer.equals(item, elem);
            return !hasElem;
        });
        return hasElem;
    };

    /**
     * Specifies how many elements the collection has, or how many satisfy a certain condition.
     * @function count
     * @memberof arrgh.Enumerable
     * @instance
     * @param {predicate} [predicate] - A function to test each element for a condition.
     * @returns {Number} - A number that specifies how many elements the collection has, or how many satisfy a certain condition.
     */
     enumProto.count = function (predicate) {
        var count = 0;
        predicate = predicate || alwaysTrue;

        this.forEach(function (elem) {
            if (predicate(elem)) {
                count += 1;
            }
        });
        return count;
    };

    /**
     * Returns the elements of the specified collection or a collection containing only the default value if the collection is empty.
     * @function defaultIfEmpty
     * @memberof arrgh.Enumerable
     * @instance
     * @param {*} defaultValue - The default value to be returned when the collection is empty.
     * @returns {arrgh.Enumerable} - A new collection containing the elements of the specified collection or a new collection containing only the default value if the collection is empty.
     */
     enumProto.defaultIfEmpty = function (defaultValue) {
        var self = this;
        return new Enumerable(function () {
            return new DefaultIfEmptyIterator(self, defaultValue);
        });
    };

    /**
     * Returns distinct elements from a collection by using the default or a custom equality comparer to compare values.
     * @function distinct
     * @memberof arrgh.Enumerable
     * @instance
     * @param {equals|equalityComparer} [eqComparer=(===)] - A function or object that tests if two elements are equal.
     * @returns {arrgh.Enumerable} - A new collection with unique elements.
     */
     enumProto.distinct = function (eqComparer) {
        return this.union(empty, eqComparer);
    };

    /**
     * Returns the element at a specified index.
     * @function elementAt
     * @memberof arrgh.Enumerable
     * @instance
     * @param {Number} index - The index of the element to find.
     * @returns {*} - The element at the specified index.
     * @throws - Throws an error if the specified index is outside the bounds of the collection.
     */
     enumProto.elementAt = function (index) {
        var def = {};
        var elem = this.elementAtOrDefault(index, def);
        if (elem === def) {
            throw new Error("Index was outside the bounds of the collection.");
        }
        return elem;
    };

    /**
     * Returns the element at a specified index or a default value.
     * @function elementAtOrDefault
     * @memberof arrgh.Enumerable
     * @instance
     * @param {Number} index - The index of the element to find.
     * @param {*} [defaultValue] - The value that is returned when the specified index is not found.
     * @returns {*} - The element at the specified index or a default value.
     */
     enumProto.elementAtOrDefault = function (index, defaultValue) {
        if (index < 0) {
            return defaultValue;
        }

        var elem;
        var elemSet = false;
        this.forEach(function (e, i) {
            if (i === index) {
                elem = e;
                elemSet = true;
                return false;
            }
        });

        if (!elemSet) {
            return defaultValue;
        }
        return elem;
    };

    /**
     * Produces the set difference of two collection.
     * @function except
     * @memberof arrgh.Enumerable
     * @instance
     * @param {arrgh.Enumerable} other - A collection whose elements that also occur in the first sequence will cause those elements to be removed from the returned collection.
     * @param {equals|equalityComparer} [eqComparer=(===)] - A function or object that tests if two elements are equal.
     * @returns {arrgh.Enumerable} - A collection that contains the set difference of the elements of two collections.
     */
    enumProto.except = function (other, eqComparer) {
        var self = this;
        return new Enumerable(function () {
            return new ExceptIterator(self, other, eqComparer);
        });
    };

    /**
     * Performs the specified action on each element of the collection.
     * @param {forEachCallback} callback - The callback that is applied to each element in the enumerable.
     * @function forEach
     * @memberof arrgh.Enumerable
     * @instance
     */
     enumProto.forEach = function (callback) {
        var iterator = this.getIterator();
        var cont = null;
        var index = 0;
        while ((isNull(cont) || cont) && iterator.moveNext()) {
            cont = callback(iterator.current(), index);
            index += 1;
        }
    };

    /**
     * Converts the collection to a JavaScript array.
     * @function toArray
     * @memberof arrgh.Enumerable
     * @instance
     * @returns {array} - Returns a JavaScript array.
     */
     enumProto.toArray = function () {
        var arr = [];
        this.forEach(function (elem) {
            arr.push(elem);
        });
        return arr;
    };

    enumProto.indexOf = function (searchElem, fromIndex) {
        var arr = this.toArray();
        if (Array.prototype.indexOf) {
            return arr.indexOf(searchElem, fromIndex);
        }

        var len = this.count();
        fromIndex = fromIndex || -1;

        if (len === 0 || fromIndex > len) {
            return -1;
        }

        var foundIndex = -1;
        var i;
        for (i = fromIndex; i < len; i += 1) {
            if (arr[i] === searchElem) {
                foundIndex = i;
                break;
            }
        }
        return foundIndex;
    };

    enumProto.filter = function (predicate) {
        var self = this;
        return new Enumerable(function () {
            return new WhereIterator(self, predicate);
        });
    };
    enumProto.where = enumProto.filter;

    enumProto.map = function (selector) {
        var self = this;
        return new Enumerable(function () {
            return new SelectIterator(self, selector);
        });
    };
    enumProto.select = enumProto.map;

    enumProto.first = function (predicate) {
        if (this.count() > 0) {
            var first;
            var found = false;
            this.forEach(function (elem) {
                if (predicate) {
                    if (predicate(elem)) {
                        first = elem;
                        found = true;
                        return false;
                    }
                } else {
                    first = elem;
                    found = true;
                    return false;
                }
            });
            if (!found) {
                throw "Collection contains no matching element.";
            }
            return first;
        } else {
            throw "Collection contains no elements.";
        }
    };

    enumProto.tail = function () {
        if (this.count() > 0) {
            var elems = [];
            this.forEach(function (elem, index) {
                if (index !== 0) {
                    elems.push(elem);
                }
            });
            return elems;
        } else {
            throw "Collection contains no elements.";
        }
    };

    enumProto.unionAll = function (other) {
        var self = this;
        return new Enumerable(function () {
            return new UnionIterator(self, other);
        });
    };
    enumProto.concat = enumProto.unionAll;

    enumProto.union = function (other, eqComparer) {
        var self = this;
        return new Enumerable(function () {
            return new UnionIterator(self, other, ensureEqComparer(eqComparer));
        });
    };

    enumProto.asEnumerable = function () {
        return new Enumerable(this.getIterator);
    };

    enumProto.toList = function () {
        return new List(this);
    };

    enumProto.toDictionary = function (keySelector, valueSelector) {
        keySelector = keySelector || identity;
        valueSelector = valueSelector || identity;

        var d = new Dictionary();
        this.forEach(function (elem) {
            d.add(keySelector(elem), valueSelector(elem));
        });
        return d;
    };

    /**
     * Sorts the elements of a sequence in ascending order according to a key.
     * @function orderBy
     * @memberof arrgh.Enumerable
     * @instance
     * @param {keySelector} keySelector - A function to extract a key from an element.
     * @returns {arrgh.OrderedEnumerable} - Returns an ordered enumerable.
     */
     enumProto.orderBy = function (keySelector) {
        return new OrderedEnumerable(this, keySelector, false);
    };

    /**
     * Sorts the elements of a sequence in descending order according to a key.
     * @function orderByDescending
     * @memberof arrgh.Enumerable
     * @instance
     * @param {keySelector} keySelector - A function to extract a key from an element.
     * @returns {arrgh.OrderedEnumerable} - Returns an ordered enumerable.
     */
     enumProto.orderByDescending = function (keySelector) {
        return new OrderedEnumerable(this, keySelector, true);
    };

    /**
     * Represents a list of objects that can be accessed by index. Provides methods to manipulate the list.
     * @memberof arrgh
     * @constructor
     * @extends arrgh.Enumerable
     * @param {array|arrgh.Enumerable} [arr=[]] - An array or Enumerable whose elements are copied to the new list.
     */
     List = function () {
        var self = this;
        Enumerable.call(self, function () {
            return new ArrayIterator(self);
        });

        var iterable;
        if (arguments.length > 1) {
            iterable = Array.prototype.slice.call(arguments);
        } else {
            iterable = arguments[0] || [];
        }

        if (isArray(iterable)) {
            self.length = iterable.length;
            var i;
            for (i = 0; i < iterable.length; i += 1) {
                self[i] = iterable[i];
            }
        } else { // Enumerable
            self.length = 0;
            iterable.forEach(function (elem, index) {
                self[index] = elem;
                self.length += 1;
            });
        }
    };
    inherit(List, Enumerable);

    var listProto = List.prototype;

    listProto.add = function (elem) {
        this[this.length] = elem;
        this.length += 1;
    };

    listProto.addRange = function () {
        if (arguments.length === 1 && arguments[0].getIterator) {
            var self = this;
            arguments[0].forEach(function (elem) {
                self[self.length] = elem;
                self.length += 1;
            });
        } else {
            var arr = arguments.length === 1 && isArray(arguments[0]) ? arguments[0] : arguments;
            var i;
            for (i = 0; i < arr.length; i += 1) {
                this[this.length] = arr[i];
                this.length += 1;
            }
        }
    };

    listProto.push = function () {
        this.addRange(arguments);
        return this.length;
    };

    listProto.remove = function (elem) {
        var len = this.length;
        var i;
        var found = false;
        for (i = 0; i < len; i += 1) {
            found = found || this[i] === elem;
            if (found) {
                this[i] = this[i + 1];
            }
        }
        if (found) {
            delete this[len - 1];
            this.length -= 1;
        }
        return found;
    };

    /**
     * Specifies how many elements the collection has, or how many satisfy a certain condition.
     * @function count
     * @memberof arrgh.List
     * @instance
     * @param {predicate} [predicate] - A function to test each element for a condition.
     * @returns {Number} - A number that specifies how many elements the collection has, or how many satisfy a certain condition.
     */
     listProto.count = function (predicate) {
        if (!predicate) {
            return this.length;
        } else {
            return Enumerable.prototype.count.call(this, predicate);
        }
    };

    listProto.toArray = function () {
        return Array.prototype.slice.call(this);
    };

    /**
     * Represents a collection of keys and values.
     * @memberof arrgh
     * @constructor
     * @extends arrgh.Enumerable
     */
     Dictionary = function (eqComparer) {
        var self = this;
        Enumerable.call(self, function () {
            return new DictionaryIterator(self);
        });

        self.length = 0;
        self._ = {
            eqComparer: ensureEqComparer(eqComparer),
            hashes: new List(),
            keys: {}
        };
    };
    inherit(Dictionary, Enumerable);

    var dictProto = Dictionary.prototype;

    var containsKey = function (hash, key, privs) {
        if (privs.keys.hasOwnProperty(hash)) {
            return privs.keys[hash].contains(key, function (x, y) {
                return privs.eqComparer.equals(x.key, y);
            });
        }
        return false;
    };

    dictProto.containsKey = function (key) {
        var hash = this._.eqComparer.getHash(key);
        return containsKey(hash, key, this._);
    };

    dictProto.add = function (key, value) {
        var hash = this._.eqComparer.getHash(key);
        if (containsKey(hash, key, this._)) {
            throw new Error("Key [" + key + "] is already present in the dictionary.");
        }

        if (!this._.keys[hash]) {
            this._.keys[hash] = new List();
        }
        this._.keys[hash].add({ key: key, value: value });
        this._.hashes.add(hash);

        this.length += 1;
    };

    var getKvpByKey = function (dict, hash, key) {
        if (!dict._.keys.hasOwnProperty(hash)) {
            throw new Error("Key [" + key + "] was not found in the dictionary.");
        }
        var elem = dict._.keys[hash].first(function (kvp) {
            return dict._.eqComparer.equals(kvp.key, key);
        });
        if (!elem) {
            throw new Error("Key [" + key + "] was not found in the dictionary.");
        }
        return elem;
    };

    dictProto.remove = function (key) {
        var hash = this._.eqComparer.getHash(key);
        var elem = getKvpByKey(this, hash, key);
        var keys = this._.keys[key];
        keys.remove(elem);
        if (!keys.any()) {
            delete this._.keys[key];
            this._.hashes.remove(hash);
        }
        this.length -= 1;
    };

    dictProto.get = function (key) {
        var hash = this._.eqComparer.getHash(key);
        return getKvpByKey(this, hash, key).value;
    };

    var getKvps = function (selector) {
        var keys = new List();
        var prop;
        for (prop in this._.keys) {
            if (this._.keys.hasOwnProperty(prop)) {
                keys.addRange(this._.keys[prop].select(selector));
            }
        }
        return keys;
    };

    dictProto.getKeys = function () {
        return getKvps(function (kvp) {
            return kvp.key;
        });
    };

    dictProto.getValues = function () {
        return getKvps(function (kvp) {
            return kvp.value;
        });
    };

    /**
     * Specifies how many elements the collection has, or how many satisfy a certain condition.
     * @function count
     * @memberof arrgh.Dictionary
     * @instance
     * @param {predicate} [predicate] - A function to test each element for a condition.
     * @returns {Number} - A number that specifies how many elements the collection has, or how many satisfy a certain condition.
     */
     dictProto.count = function (predicate) {
        if (!predicate) {
            return this.length;
        } else {
            return Enumerable.prototype.count.call(this, predicate);
        }
    };

    /**
     * Represents an ordered collection that can be iterated over.
     * @memberof arrgh
     * @constructor
     * @param {arrgh.Enumerable} source - The collection that needs to be sorted.
     * @param {keySelector} keySelector - A function to extract the key from an element.
     * @param {Boolean} descending - Indicated wheter the collection needs to be sorted ascending or descending.
     */
     OrderedEnumerable = function (source, keySelector, descending) {
        var self = this;
        Enumerable.call(this, function () {
            return new OrderedIterator(self);
        });
        self._ = {
            source: source,
            keySelector: keySelector || identity,
            descending: descending ? -1 : 1
        };
    };
    inherit(OrderedEnumerable, Enumerable);

    var ordProto = OrderedEnumerable.prototype;

    /**
     * Performs a subsequent ordering of the elements in a sequence in ascending order according to a key.
     * @function thenBy
     * @memberof arrgh.OrderedEnumerable
     * @instance
     * @param {keySelector} keySelector - A function to extract a key from an element.
     * @returns {arrgh.OrderedEnumerable} - Returns an ordered enumerable.
     */
     ordProto.thenBy = function (keySelector) {
        return new OrderedEnumerable(this, keySelector, false);
    };

    /**
     * Performs a subsequent ordering of the elements in a sequence in descending order according to a key.
     * @function thenByDescending
     * @memberof arrgh.OrderedEnumerable
     * @instance
     * @param {keySelector} keySelector - A function to extract a key from an element.
     * @returns {arrgh.OrderedEnumerable} - Returns an ordered enumerable.
     */
     ordProto.thenByDescending = function (keySelector) {
        return new OrderedEnumerable(this, keySelector, true);
    };

    return {
        Enumerable: Enumerable,
        List: List,
        Dictionary: Dictionary
    };
}());