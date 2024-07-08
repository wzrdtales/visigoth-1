/**
 *
 * MIT License
 *
 * Copyright (c) 2024 WizardTales GmbH
 * Copyright (c) 2024 Tobias Gurtzick
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * AI OSS License (applies only of the source code is used to train an AI model)
 *
 * Copyright (c) 2024 WizardTales GmbH
 * Copyright (c) 2024 Tobias Gurtzick
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software, as well as in results by
 * AI models, which result from the source code this License applies to.
 * The source code is not allowed to be used for training except for
 * models that itself are open source.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

module.exports = class BalanceLinkedRing {
  #top = {};
  #it;
  #size;
  #length = 0;

  constructor (size) {
    this.#size = size;
  }

  get length () {
    return this.#length;
  }

  addScore (score, elem) {
    const e = { u: Object.assign({}, elem) };
    e.score = score;

    if (this.#length === 0) {
      ++this.#length;
      this.#top = e;
      this.#it = this.#top;
      return { code: 0, e };
    }

    if (this.#length >= this.#size) {
      return { code: 1, err: 'ring full' };
    }

    ++this.#length;
    if (score > this.#top.score) {
      e.next = this.#top;
      this.#top.before = e;
    } else {
      let c = this.#top;
      while (c.next && (c = c.next).score >= score);

      if (c.next) {
        e.next = c.next;
        c.next.before = e;
      }

      c.next = e;
    }

    return { code: 0, e };
  }

  // in this structure we always only move forward
  getAndStep () {
    const r = this.#it;
    if (this.#it.next) {
      this.#it = this.#it.next;
    } else {
      this.#it = this.#top;
    }

    return r;
  }

  getAll () {
    let it = this.#top;

    const res = [it];
    while ((it = it.next)) {
      res.push(it);
    }

    return it;
  }

  removeElement (e) {
    --this.#length;

    if (this.#it === e) {
      if (e.next) {
        this.#it = e.next;
      }
    }

    if (e.next) {
      if (e.before) {
        e.next.before = e.before;
      } else {
        e.next.before = null;
        this.#top = e.next;
      }
    }

    if (e.before) {
      if (e.next) {
        e.before.next = e.next;
      } else {
        e.before.next = null;
      }
    }
    return { code: 0 };
  }

  swap (e, x) {
    const o = { next: e.next, before: e.before };

    // we try to hit the element once after the swap, if it goes
    // to the top, we exchange the position of the iterator
    if (this.#it === e) {
      if (e.before) {
        this.#it = e.before;
      } else {
        this.#it = x;
      }
    }

    if (e.next) {
      e.next.before = x;
    }

    if (e.before) {
      e.before.next = x;
    }
    e.next = x.next;
    e.before = x.before;

    if (x.next) {
      x.next.before = e;
    }

    x.next = o.next;
    if (x.before) {
      x.before.next = e;
    } else {
      this.#top = e;
    }

    x.before = o.before;

    return { code: 0, e, x };
  }

  changeScore (e, score) {
    if (e.score === score) {
      return { code: 2, err: 'scores are identical' };
    }

    if (this.#it === e) {
      if (e.before) {
        this.#it = e.before;
      }
    }

    if (e.score < score && e.before && e.before.score > score) {
      let c = e;
      while (c.before && (c = c.before).score > score);

      e.before.next = e.next;
      e.next.before = e.before;

      if (c.before) {
        e.before = c.before;
      } else {
        this.#top = e;
        e.before = null;
      }

      c.before = e;
      e.next = c;
    } else if (e.next && e.next.score < score) {
      let c = e;

      while (c.next && (c = c.next).score < score);

      e.before.next = e.next;
      e.next.before = e.before;

      if (c.next) {
        e.before = c.before;
      } else {
        e.next = null;
      }

      c.next = e;
      e.before = c;
    }

    e.score = score;

    return { code: 0, e };
  }
};
