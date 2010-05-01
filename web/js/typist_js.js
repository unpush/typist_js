/*
 * Typist on Browser - Javascript implementation of Typist
 * based on T. Ogihara's Japanized version.
 *
 * Copyright (c) 2010 Masatake Osanai
 */
(function() {

var load_typist = function(e, vbell, kbd) {
  var typist = new Typist.Main(e);
  if (!typist.ready) e.innerHTML += '<br>error.';

  var addev = function(e, s, f) {
    if (window.addEventListener) {
      e.addEventListener(s, f, false);
    } else if (window.attachEvent) {
      e.attachEvent("on" + s, f);
    } else {
      e["on" + s] = f;
    }
  };

  addev(document, "keypress", function(e) {
    e = e ? e : window.event;
    if ('preventDefault' in e) e.preventDefault()
      else e.returnValue = false;
    if ('stopPropagation' in e) e.stopPropagation()
      else e.cancelBubble = true;
    var code = e.charCode ? e.charCode : e.keyCode;
    typist.keypress(code);
  });
  addev(document, "keydown", function(e) {
    e = e ? e : window.event;
    if (typist.keydown(e.keyCode)) {
      if ('preventDefault' in e) e.preventDefault()
        else e.returnValue = false;
      if ('stopPropagation' in e) e.stopPropagation()
        else e.cancelBubble = true;
    }
  });
  addev(document, "keyup", function(e) {
    e = e ? e : window.event;
    typist.keyup(e.keyCode);
  });

  if (vbell) {
    addev(vbell, "change", function () {
      typist.setVbell(vbell.checked ? '1' : '0', true);
    });
    addev(vbell, "click", function () {
      this.blur();
      window.focus();
    });
    typist.addOnUpdateSetting(function(rc) {
      vbell.checked = rc.vbell == '1';
    });
  }

  if (kbd) {
    for (var i = 0; i < kbd.length; i++) {
      addev(kbd[i], "change", function(e) {
        e = e ? e : window.event;
        var t = e.target || e.srcElement;
        if (t.checked) typist.setKeytype(t.value);
      });
      addev(kbd[i], "click", function () {
        this.blur();
        window.focus();
      });
    }
    typist.addOnUpdateSetting(function(rc) {
      for (var i = 0; i < kbd.length; i++)
        kbd[i].checked = kbd[i].value == rc.keytype;
    });
  }

  var style = typist.screen._elem.currentStyle || document.defaultView.getComputedStyle(typist.screen._elem, '');
  if (style.fontSize.indexOf("px") != -1 && parseInt(style.fontSize) < 16) e.style.fontSize = "124%";

  typist.onUpdateSetting();
};

if (!this['load_typist']) this['load_typist'] = load_typist;


})();

(function() {

// Typist Screen
var TScreen = function(e, c, r, defs) {
  this.initialize(e, c, r, defs);
};
TScreen.prototype = (function() {
  var htmlesc = function(s) {
    var div = document.createElement('div');
    var text =  document.createTextNode('');
    div.appendChild(text);
    text.data = s;
    return div.innerHTML.replace(/ /g, '&nbsp;');
  };
  var makeline = function(line, newline, col, insert) {
    if (line === undefined) line = '';
    var ret = line.substring(0, col);
    if (ret.length < col) while (ret.length < col) ret += ' ';
    ret += newline;
    if (insert) {
      ret += line.substring(col);
    } else {
      if (ret.length < line.length)
        ret += line.substring(ret.length);
    }
    return ret;
  };
/*
  var width_count = function(s) {
    var ret = 0;
    for (var i = 0; i < s.length; i++) {
      var code = s.charCodeAt(i);
      if (code >= 32 && code <= 126) ret++;
      else ret += 2;
    }
    return ret;
  };
*/
  var cursor_limit = function(s, visible) {
    var ret = 0;
    for (var i = 0; i < s.length; i++) {
      var code = s.charCodeAt(i);
      if (code >= 32 && code <= 126) {
        ret++;
        if (ret >= visible) return i;
      } else {
        ret += 2;
        if (ret > visible) return i - 1;
        if (ret == visible) return i;
      }
    }
    return s.length + visible - ret - 1;
  };
  return {
    cols : 80,
    rows : 24,
    cursor : {x : 0, y : 0},
    initialize : function(e, c, r, defs) {
      var outer = document.createElement('div');
      outer.className = 'typist-screen';
      this._frameline = document.createElement('div');
      this._frameline.className = this._defs.frameclass;
      this.set_frame_title('typist');
      outer.appendChild(this._frameline);
      var inner = document.createElement('div');
      inner.className = 'typist-screen-inner';
      this._elem = inner;
      outer.appendChild(inner);
      e.appendChild(outer);

      this.cols = c ? c : this.cols;
      this.rows = r ? r : this.rows;
      for (var i in defs) {
        if (i in this._defs) {
          this._defs[i] = defs[i];
        }
      }
      this.clear();
      this._buffer_cache = this._buffer;
      this._buffer = spawn(this._buffer_cache);
      this._cursor_cache = { y : 0, x : 0};
      this.flush();
    },
    set_frame_title : function(title) {
      this._frameline.innerHTML = this._make_frameline(title);
    },
    clear : function() {
        for(var i = 0; i < this.rows; i++) {
          this._buffer[i] = '';
          this._control_buffer[i] = '';
        }
    },
    flush : function(force) {
      var cursor = this.cursor;
      var defs = this._defs;
      var cols = this.cols;
      var strictmode = this.strictmode;

      var f = function(line, attr, render_cursor) {
        var ret = '';
        line = line.substring(0, (strictmode ? cursor_limit(line, cols) : cols) + 1);
        if (!attr && !render_cursor) {
          ret += htmlesc(line);
          return ret;
        }

        var i = 0, pt = 0, before_attr = 0;
        while (true) {
          if (attr !== undefined && (
                attr.charAt(i) != before_attr
                || i > attr.length - 1
                || (render_cursor && cursor.x == i))) {
            ret += htmlesc(line.substring(pt, i));
            if (before_attr != 0) {
              for (var b in defs.control_bits) {
                if (before_attr & defs.control_bits[b]) ret += '</span>';
              }
            }
          }

          if (render_cursor && cursor.x == i) {
            ret += '<span class="' + defs.cursorclass + '">' + htmlesc(line.charAt(i) || ' ') + '</span>';
            before_attr = 0;
            pt = i + 1;
            if (attr === undefined || i > attr.length - 1) break;
            i++;
            continue;
          }

          if (attr === undefined || i > attr.length - 1) break;

          if (attr.charAt(i) != before_attr) {
            for (var b in defs.control_bits) {
              if (attr.charAt(i) & defs.control_bits[b])
                ret += '<span class="' + defs.control_class[b] + '">';
            }
            pt = i;
            before_attr = attr.charAt(i);
          }
          i++;
        }
        if (i < line.length) ret += htmlesc(line.substring(i));
        return ret;
      };

      force = force || this._elem.childNodes.length < this.rows;
      if (force) {
        var buf = '';
        for (var i = 0; i < this.rows; i++)
          buf += '<div>' + (f(this._buffer[i], this._control_buffer[i], cursor.y == i) || '<br/>') + '</div>';
        this._elem.innerHTML = buf;
      } else {
        for (var i = 0; i < this.rows; i++) {
          if (cursor.y !== i && this._cursor_cache.y !== i
            && this._buffer[i] === this._buffer_cache[i]) continue;
          this._elem.childNodes[i].innerHTML = f(this._buffer[i], this._control_buffer[i], cursor.y == i) || '<br/>';
        }
      }
      this._buffer_cache = this._buffer;
      this._buffer = spawn(this._buffer_cache);
      this._cursor_cache = {y : cursor.y, x : cursor.x};
    },
    move : function(y, x, force) {
      if (!isNumArg(y)) y = this.cursor.y;
      if (!isNumArg(x)) x = this.cursor.x;
      var xlimit = this.strictmode ? cursor_limit(this._buffer[y], this.cols) : this.cols;
      if (x < 0 || x > xlimit || y < 0 || y >= this.rows) {
        if (x < 0) x = 0;
        if (x >= this.cols) x = this.cols - 1;
        if (y < 0) y = 0;
        if (y >= this.rows) y = this.rows - 1;
        if (force) this.move(y, x);
        return [y, x];
      }
      this.cursor.y = y;
      this.cursor.x = x;
      return true;
    },
    write : function(data, y, x) {
      y = isNumArg(y) ? y : this.cursor.y;
      if (data.constructor === Array) {
        for (var i = 0; i < data.length; i++) {
          this._buffer[y] = makeline(this._buffer[y], data[i], 0, this.insertmode);
          this._control_buffer[y] = this._make_controlline(
            this._control_buffer[y], data[i].length, 0, this.insertmode);
          y++;
        }
        y--;
        this.move(y, isNumArg(x) ? x : data[data.length - 1].length, true);
      } else {
        x = isNumArg(x) ? x : this.cursor.x;
        this._buffer[y] = makeline(this._buffer[y], data, x, this.insertmode);
        this._control_buffer[y] = this._make_controlline(
          this._control_buffer[y], data.length, x, this.insertmode);
        x += data.length;
        this.move(y, x, true);
      }
    },
    _make_controlline : function (line, length, col, insert) {
      if (line === undefined) line = '';
      var ret = line.substring(0, col);
      if (ret.length < col) while (ret.length < col) ret += '0';
      var newline = '';
      for (var i = 0; i < length; i++) {
        var c = 0;
        for (var a in this._controls) {
          if (!this._controls[a]) continue;
          c |= this._defs.control_bits[a];
        }
        newline += c;
      }
      ret += newline;
      if (insert) {
        ret += line.substring(col);
      } else {
        if (ret.length < line.length)
          ret += line.substring(ret.length);
      }
      return ret;
    },
    addLine : function(y, line) {
      y = isNumArg(y) ? y : this.cursor.y;
      line = line === undefined ? '' : line;
      this._buffer = (this._buffer.slice(0, y)).concat(line, this._buffer.slice(y));
      if (this.cursor.y > y) this.cursor.y++;
    },
    clearLine : function(y) {
      y = isNumArg(y) ? y : this.cursor.y;
      this._buffer[y] = '';
      this._control_buffer[y] = '';
    },
    eraseLine : function(y, n) {
      y = isNumArg(y) ? y : this.cursor.y;
      n = isNumArg(n) ? n : 1;
      this._buffer.splice(y, n);
      this._control_buffer.splice(y, n);
      for (var i = 0; i < n; i++) this._buffer.push('');
      for (var i = 0; i < n; i++) this._control_buffer.push('');
    },
    erase : function(x, y) {
      x = isNumArg(x) ? x : this.cursor.x;
      y = isNumArg(y) ? y : this.cursor.y;
      this._buffer[y] = this._buffer[y].substring(0, x) + this._buffer[y].substring(x + 1);
      this._control_buffer[y] = this._control_buffer[y].substring(0, x) + this._control_buffer[y].substring(x + 1);
    },
    backerase : function(x, y) {
      x = (isNumArg(x) ? x : this.cursor.x);
      y = isNumArg(y) ? y : this.cursor.y;
      if (x > 0) {
        x--;
        this.move(y, x);
        this.erase(x, y);
      }
    },
    getc : function(x, y) {
      x = isNumArg(x) ? x : this.cursor.x;
      y = isNumArg(y) ? y : this.cursor.y;
      return this._buffer[y].charAt(x);
    },
    stand_out : function(kind) {
      switch (kind) {
      case "STANDOUT":
        this._controls["negative"] = true;
        break;
      case "UNDERLINE":
        this._controls["underline"] = true;
        break;
      case "BOLD":
        this._controls["bold"] = true;
        break;
      default:
        break;
      }
    },
    stand_end : function(kind) {
      switch (kind) {
      case "STANDOUT":
        this._controls["negative"] = false;
        break;
      case "UNDERLINE":
        this._controls["underline"] = false;
        break;
      case "BOLD":
        this._controls["bold"] = false;
        break;
      case "ALLATTR":
        for (var i in this._controls)
          this._controls[i] = false;
        break;
      default:
        break;
      }
    },
    vbell : function() {
      var e = this._elem;
      e.className = (function(s, c) {
        var ret = s.split(' ');
        ret.push(c);
        return ret.join(' ');
      })(e.className, 'typist-negative')
      setTimeout(function() {
        e.className = (function(s, c) {
          var ret = s.split(' ');
          for (var i = 0; i < ret.length; i++) {
            if (ret[i] == c) ret.splice(i, 1);
          }
          return ret.join(' ');
        })(e.className, 'typist-negative');
      }, 65);
    },
    _elem : null,
    _buffer : [],
    _control_buffer : [],
    _controls : {negative : false, underline : false, bold : false},
    _buffer_cache : [],
    _cursor_cache : [],
    _defs : {
      framechar : '_',
      frameclass : 'typist-frameline',
      cursorchar : '&nbsp;',
      cursorclass : 'typist-cursor',
      control_bits : {bold : 1, underline : 2, negative : 4},
      control_class : {bold : 'typist-bold', underline : 'typist-underline', negative : 'typist-negative'}
    },
    _frameline : '',
    _make_frameline : function(title) {
      var line = '';
      for(var i = 0; i < this.cols - title.length - 5; i++) line += '_';
      return '<span style="border: groove 2px #294345">&nbsp;-&nbsp;</span>&nbsp;' + title + '<span style="visibility: hidden;">' + htmlesc(line) + '</span>';
    },
    insertmode : false,
    strictmode : false
  };
})();

// Typist Lesson
var Lesson = function() {
  this.initialize();
};
Lesson.prototype = (function() {
  var score_js = function(score) {
    var ret = {};
    for (var i = 0; i < score.length; i++) {
      ret[score[i].charAt(0)] = parseInt(score[i].substring(1));
    }
    return ret;
  };
  var display_drill = function(screen, lesson, retry) {
    if (retry) {
      screen.move(0, 0);
      screen.write("もう１回...");
    }
    /* display drill pattern */
    var i, ln;
    for (i = 0, ln = 3; i < lesson.lines.length; i++, ln += 2) {
      screen.move(ln, 0);
      screen.write(lesson.lines[i]);
    }
    screen.move(4, 0);
  };
  var display_para = function(screen, lesson, retry) {
    if (retry) {
      screen.move(0, 0);
      screen.write("もう１回...");
    }
    /* print out practice text */
    var i, ln;
    for (i = 0, ln = 3; i < lesson.lines.length; i++, ln ++) {
      screen.move(ln, 0);
      screen.write(lesson.lines[i]);
    }
    screen.move(3, 0);
  };
  var display_kana = function(screen, ruby, lesson, retry) {
    if (retry) {
      screen.move(0, 0);
      screen.write("もう１回...");
    }
    /* display drill pattern */
    var i, ln;
    if (ruby) {
      for (i = 0, ln = 3; i < lesson.lines.length; i++, ln += 3) {
        screen.move(ln, 0);
        screen.write(lesson.lines[i]);
        screen.move(ln + 1, 0);
        screen.write(lesson.lines[++i]);
      }
      screen.move(5, 0);
    } else {
      for (i = 0, ln = 3; i < lesson.lines.length; i++, ln += 2) {
        screen.move(ln, 0);
        screen.write(lesson.lines[i]);
      }
      screen.move(4, 0);
    }
  };
  var display_quick = function(screen, ruby, lesson, retry) {
    if (retry) {
      screen.move(0, 0);
      screen.write("もう１回...");
    }
    /* print out practice text */
    var i, ln;
    if (ruby) {
      for (i = 0, ln = 3; i < lesson.lines.length; i++, ln += 2) {
        screen.move(ln, 0);
        screen.write(lesson.lines[i]);
        screen.move(ln + 1, 0);
        screen.write(lesson.lines[++i]);
      }
      screen.move(4, 0);
    } else {
      for (i = 0, ln = 3; i < lesson.lines.length; i++, ln ++) {
        screen.move(ln, 0);
        screen.write(lesson.lines[i]);
      }
      screen.move(3, 0);
    }
  };
  return {
    idx : null,
    rc : null,
    initialize : function() {
      this.idx = this.get_index();
      if (!this.idx) return;
      this.ready = true;
    },
    get_index : function() {
      if (!Typist_lesson_data) return null;
      return Typist_lesson_data["index"];
    },
    get_lesson : function() {
      var buf = [];
      buf.push('  以下からコースを選択して下さい:');
      var s = score_js(this.rc.score);
      var nextLesson = this.rc.lastLesson || this.idx[0].course;
      var help = null;
      for(var i = 0; i < this.idx.length; i++) {
        var l = this.idx[i];
        if (l.course == '?') {
          var help = " (ヘルプ=?) ------> ";
//          var help = "(HELP=?) ---> ";
          continue;
        }
        if (l.course == nextLesson)
          nextLesson += (l.course in s ? (s[l.course] >= l.num ? '1' : s[l.course] + 1) : '1');
        buf.push("        " + l.title + '(' + l.course + '1 - ' + l.course + l.num + ') '
          + (l.course in s ? (s[l.course] >= l.num ? " !!!終了!!!" : " [" + l.course + s[l.course] + "まで終了]") : ''));
      }
      buf.push(" 練習したいレッスンの名前(例 " + nextLesson + ")を入力して下さい");
      buf.push(help || ": ");
      return buf;
    },
    ready : false,
    check_lesson : function(check) {
      var n = parseInt(check.substring(1));
      for(var i = 0; i < this.idx.length; i++) {
        if (check.substring(0, 1) == this.idx[i].course && n > 0 && n <= this.idx[i].num) {
          var ret = spawn(this.idx[i]);
          ret.num = n;
          return ret;
        }
      }
      return null;
    },
    find_lesson : function(l) {
      if (!Typist_lesson_data) return null;
      var c = l.course.toLowerCase();
      if (!(c in Typist_lesson_data)) return false;
      for (var i = 0; i < Typist_lesson_data[c].length; i++) {
        if (c == Typist_lesson_data[c][i].course &&
          l.num == Typist_lesson_data[c][i].num &&
          Typist_lesson_data[c][i].keytype.indexOf(this.rc.keytype) != -1) {
          this.lesson_data = Typist_lesson_data[c][i];
          this.lesson_phase = 0;
          this.skip_lesson = false;
          return true;
        }
      }
      return null;
    },
    give_lesson : function(screen, phase, retry) {
      if (isNumArg(phase)) this.lesson_phase = phase;
      else
      if (!retry) {
        this.lesson_phase++;
      }
      if (this.lesson_phase >= this.lesson_data.data.length)
        return true;
      var l;
      while (l = this.lesson_data.data[this.lesson_phase]) {
        if (l.kind == "T") {
          screen.clear();
          screen.move(1, 0);
          screen.write(l.lines);
          break;
        } else
        if (l.kind == "B") {
          screen.clear();
          screen.move(1, 0);
          screen.write(l.lines);
          break;
        } else
        if (l.kind == "I") {
          screen.clear();
          screen.move(0, 0);
          screen.write(l.lines);
          this.lesson_phase++;
        } else
        if (l.kind == "D") {
          display_drill(screen, l, retry);
          break;
        } else
        if (l.kind == "P") {
          display_para(screen, l, retry);
          break;
        } else
        if (l.kind == "K" || l.kind == "k") {
          display_kana(screen, l.kind == "k", l, retry);
          break;
        } else
        if (l.kind == "Q" || l.kind == "q") {
          display_quick(screen, l.kind == "q", l, retry);
          break;
        } else {
//console.warn('UNKNOWN KIND:' + l.kind);
          break;
        }
      }
      return l;
    },
    retry_lesson : function(screen) {
      return this.give_lesson(screen, null, true);
    },
    update_lesson : function() {
      this.save_rc(this.lesson_data.course, this.lesson_data.num);
    },
    save_rc : function(course, num) {
      this.rc.lastLesson = course;
      for (var i = 0; i < this.rc.score.length; i++) {
        if (this.rc.score[i].charAt(0) == course) {
          if (parseInt(this.rc.score[i].substring(1)) < num)
            this.rc.score[i] = course + num;
          return;
        }
      }
      this.rc.score.push(course + num);
    },
    lesson_data : null,
    lesson_phase : null,
    skip_lesson : false
  };
})();

// Typist Main
var Main = function(elem) {
  this.load(elem);
  if (this.ready) {
    this.get_lesson();
  }
};
Main.prototype = (function() {

  var BaseHandler = function(screen) {
    this.initialize(screen);
  };
  BaseHandler.prototype = {
    initialize : function(screen) {
      this.screen = screen;
      this.ctrls = {};
      this._ctrl = false;
      this._shift = false;
    },
    keydown : function(keyCode) {
      if (keyCode == this._defs.keycode.backspace
        || keyCode == this._defs.keycode.shift
        || keyCode == this._defs.keycode.ctrl
        || keyCode == this._defs.keycode.H
        || keyCode == this._defs.keycode.F
        || keyCode == this._defs.keycode.L
        || keyCode == this._defs.keycode.G) {
        this.input(keyCode);
        return true;
      } else {
        return false;
      }
    },
    keyup : function(keyCode) {
      if (keyCode == this._defs.keycode.shift
        || keyCode == this._defs.keycode.ctrl)
        this.input(keyCode, true);
    },
    keypress : function(code) {
      if (code == this._defs.keycode.backspace
        || code == this._defs.keycode.h
        || code == this._defs.keycode.H
        || code == this._defs.keycode.f
        || code == this._defs.keycode.F
        || code == this._defs.keycode.l
        || code == this._defs.keycode.L
        || code == this._defs.keycode.g
        || code == this._defs.keycode.G) {
        return false;
      } else {
        this.input(code);
        return true;
      }
    },
    input : function(code, off) {
      if (code >= 32 && code <= 126) {
        if ((code == this._defs.keycode.h || code == this._defs.keycode.H) && this._ctrl) {
          this.backspace(code);
        } else
        if ((code == this._defs.keycode.f || code == this._defs.keycode.F) && this._ctrl &&
            ('f' in this.ctrls) && (typeof this.ctrls['f'] == 'function')) {
          this.ctrls.f(code);
        } else
        if ((code == this._defs.keycode.l || code == this._defs.keycode.L) && this._ctrl &&
            ('l' in this.ctrls) && (typeof this.ctrls['l'] == 'function')) {
          this.ctrls.l(code);
        } else
        if ((code == this._defs.keycode.g || code == this._defs.keycode.G) && this._ctrl &&
            ('g' in this.ctrls) && (typeof this.ctrls['g'] == 'function')) {
          this.ctrls.g(code);
        } else {
          if (code == this._defs.keycode.H) {
            this.ascii(this._shift ? this._defs.keycode.H : this._defs.keycode.h);
          } else
          if (code == this._defs.keycode.F) {
            this.ascii(this._shift ? this._defs.keycode.F : this._defs.keycode.f);
          } else
          if (code == this._defs.keycode.L) {
            this.ascii(this._shift ? this._defs.keycode.L : this._defs.keycode.l);
          } else
          if (code == this._defs.keycode.G) {
            this.ascii(this._shift ? this._defs.keycode.G : this._defs.keycode.g);
          } else {
            this.ascii(code);
          }
        }
      } else
      if (code == this._defs.keycode.backspace) {
        this.backspace(code);
      } else
      if (code == this._defs.keycode.enter) {
        this.enter(code);
      } else
      if (code == this._defs.keycode.shift) {
        this.shift(!off);
      } else
      if (code == this._defs.keycode.ctrl) {
        this.ctrl(!off);
      } else {
        this.other(code);
      }
    },
    ascii : function () {},
    backspace : function() {},
    enter : function() {},
    ctrl : function(v) {
      this._ctrl = (v === undefined ? (this._ctrl ? false : true) :
        (v ? true : false));
    },
    shift : function(v) {
      this._shift = (v === undefined ? (this._shift ? false : true) :
        (v ? true : false));
    },
    _defs : {
      keycode : {
        backspace : 8,
        enter : 13,
        shift : 16,
        ctrl : 17,
        H : 72,
        h : 104,
        f : 102,
        F : 70,
        l : 108,
        L : 76,
        g : 103,
        G : 71
      }
    }
  };

  var InfoHandler = function(screen) {
    this.initialize(screen);
  };
  InfoHandler.prototype = (function() {
    var p = new BaseHandler();
    p.initialize = function(screen) {
      BaseHandler.prototype.initialize.call(this, screen);
    };
    p.ascii = function(code) {
      var c = String.fromCharCode(code);
      if (c === '?') {
        this.screen.move(0, 0);
        this.screen.stand_out("STANDOUT");
        this.screen.write("[ *HELP* ] ^F=SKIP ^H/BS=REPEAT ^L=MENU ^G=BELL");
        this.screen.stand_end("STANDOUT");
      } else {
        this.submit();
      }
    };
    p.enter = p.other = function() {
      this.submit();
    };
    p.backspace = function() {
      this.submit(true);
    };
    return p;
  })();

  var LineEditHandler = function(screen) {
    this.initialize(screen);
  };
  LineEditHandler.prototype = (function() {
    var p = new BaseHandler();
    p.initialize = function(screen) {
      BaseHandler.prototype.initialize.call(this, screen);
    };
    p.ascii = function(code) {
      var c = String.fromCharCode(code);
      this.screen.write(c);
      this.screen.flush();
    };
    p.backspace = function() {
      this.screen.backerase();
      this.screen.flush();
    };
    return p;
  })();

  var LessonHandler = function(screen, skip_lesson, break_lesson) {
    this.initialize(screen, skip_lesson, break_lesson);
  };
  LessonHandler.prototype = (function() {
    var p = new LineEditHandler();
    p.initialize = function(screen, skip_lesson, break_lesson) {
      LineEditHandler.prototype.initialize.call(this, screen);
      this.ctrls.f = skip_lesson;
      this.ctrls.l = break_lesson;
    };
    return p;
  })();

  var DrillHandler = function(screen, skip_lesson, break_lesson, drill) {
    this.initialize(screen, skip_lesson, break_lesson, drill);
  };
  DrillHandler.prototype = (function() {
    var _p = LessonHandler;
    var p = new _p();
    p.initialize = function(screen, skip_lesson, break_lesson, drill) {
      _p.prototype.initialize.call(this, screen, skip_lesson, break_lesson);
      this.drill = drill;
      this.drill_line = 0;
      this.submit = null;
      this.errors = 0;
      this.input_count = 0;
      this.startTime = null;
    };
    p.is_linefin = function() {
      return this.screen.cursor.x >= this.drill.lines[this.drill_line].length;
    };
    p.is_nextline = function() {
      if (this.drill.lines.length > this.drill_line + 1) {
        this.drill_line++;
        this.go_nextline();
        return true;
      }
      return false;
    };
    p.go_nextline = function() {
      return this.screen.move(this.screen.cursor.y + 2, 0);
    };
    p.inputTest = function(code) {
      if (this.input_count == 0) this.startTime = new Date().getTime();
      this.input_count++;
      if (this.is_linefin()) {
        if (!this.is_nextline()) {
          var endTime = new Date().getTime();
          this.displaySpeed(endTime - this.startTime, this.errors);
          this.submit(this.errors);
        }
        return false;
      }
      return true;
    };
    p.err = function() {
      this.errors++;
      this.screen.write('X');
      if (this.vbell) this.screen.vbell();
    };
    p.ascii = function(code) {
      if (!this.inputTest(code)) return;
      var c = String.fromCharCode(code);
      if (c === this.drill.lines[(this.screen.cursor.y - 4)/2].charAt(this.screen.cursor.x)) {
        this.screen.write(c);
      } else {
        this.err();
      }
    };
    p.backspace = function () {
      if (!this.inputTest()) return;
      this.err();
    };
    p.enter = p.backspace;
    p.displaySpeed = function(elapsed, errs) {
      var totalChars = 0;
      for (var i = 0; i < this.drill.lines.length; i++)
        totalChars += this.drill.lines[i].length + 1;  /* +1 for NULL */
      var testTime = elapsed / 1000 / 60;
      var words = totalChars / 5;
      var speed = words / testTime;
      if ((words -= errs) < 0) words = 0;
      var adjustedSpeed = words / testTime;

      this.screen.move(19, 18);
      this.screen.write("入力スピード       = " + ("     " + speed.toFixed(1)).substr(-5) + " (語/分)");
      this.screen.move(20, 18);
      this.screen.write("誤入力を除いた場合 = " + ("     " + adjustedSpeed.toFixed(1)).substr(-5) + " (語/分)");
      this.screen.move(21, 30);
      this.screen.write("(誤入力率 " + ('     ' + (100.0 * errs / totalChars).toFixed(1)).substr(-5) + "％)");
    };
    return p;
  })();

  var ParaHandler = function(screen, skip_lesson, break_lesson, drill) {
    this.initialize(screen, skip_lesson, break_lesson, drill);
  };
  ParaHandler.prototype = (function() {
    var _p = DrillHandler;
    var p = new _p();
    p.initialize = function(screen, skip_lesson, break_lesson, drill) {
      _p.prototype.initialize.call(this, screen, skip_lesson, break_lesson, drill);
    };
    p.ascii = function(code) {
      if (!this.inputTest(code)) return;
      var c = String.fromCharCode(code);
      if (c === this.drill.lines[this.screen.cursor.y - 3].charAt(this.screen.cursor.x)) {
        this.screen.write(c);
      } else {
        this.err();
      }
    };
    p.backspace = function () {
      if (!this.inputTest()) return;
      if (this.screen.cursor.x > 0) {
        this.screen.write(this.drill.lines[this.screen.cursor.y - 3].charAt(this.screen.cursor.x));
        this.screen.move(null, this.screen.cursor.x - 2);
      }
    };
    p.enter = function () {
      if (!this.inputTest()) return;
      this.err();
    };
    p.err = function() {
      this.errors++;
      this.screen.stand_out("STANDOUT");
      this.screen.write(this.drill.lines[this.screen.cursor.y - 3].charAt(this.screen.cursor.x));
      this.screen.stand_end("STANDOUT");
      if (this.vbell) this.screen.vbell();
    };
    p.go_nextline = function() {
      return this.screen.move(this.screen.cursor.y + 1, 0);
    };
    return p;
  })();

  var KanaHandler = function(screen, keytype, keymap, ruby, skip_lesson, break_lesson, drill) {
    this.initialize(screen, keytype, keymap, ruby, skip_lesson, break_lesson, drill);
  };
  KanaHandler.prototype = (function() {
    var _p = DrillHandler;
    var p = new _p();
    p.initialize = function(screen, keytype, keymap, ruby, skip_lesson, break_lesson, drill) {
      _p.prototype.initialize.call(this, screen, skip_lesson, break_lesson, drill);
      this.keytype = keytype;
      this.keymap = keymap;
      this.charPt = 0;
      this.ruby = ruby;
      if (ruby) this.drill_line++;
    };
    p.keydown = function(keyCode) {
      if (keyCode == this._defs.keycode.backspace
        || keyCode == this._defs.keycode.shift
        || keyCode == this._defs.keycode.ctrl
        || keyCode == this._defs.keycode.H
        || keyCode == this._defs.keycode.F
        || keyCode == this._defs.keycode.L
        || keyCode == this._defs.keycode.G) {
        this.input(keyCode);
        return true;
      } else if (this.keytype === 'j' && keyCode == 48 && this._shift) {
        this.ascii(126);  // 「~」
      } else {
        return false;
      }
    };
    p.ascii = function(code) {
      if (!this.inputTest(code)) return;
      var c = String.fromCharCode(code) === ' ' ? ' ' : this.keymap[String.fromCharCode(code)];
      if (String.fromCharCode(code) === '\\' &&
        this.drill.lines[this.drill_line].charAt(this.charPt) === 'ー') c = 'ー';
      if (c === this.drill.lines[this.drill_line].charAt(this.charPt)) {
        this.screen.write(c);
        this.charPt++;
        if (c === ' ') {
          this.screen.write(c);
          this.charPt++;
        }
      } else {
        this.err();
      }
    };
    p.enter = function () {
      if (!this.inputTest()) return;
      this.err();
    };
    p.backspace = p.enter;
    p.err = function() {
      this.errors++;
      this.screen.write('XX');
      this.charPt +=
        (' ' !== this.drill.lines[this.drill_line].charAt(this.charPt)) ? 1 : 2;
      if (this.vbell) this.screen.vbell();
    };
    p.is_linefin = function() {
      return this.charPt >= this.drill.lines[this.drill_line].length;
    };
    p.go_nextline = function() {
      if (this.ruby) this.drill_line++;
      this.charPt = 0;
      return this.screen.move(this.screen.cursor.y + (this.ruby ? 3 : 2), 0);
    };
    return p;
  })();

  var KanaQuickHandler = function(screen, keytype, keymap, ruby, skip_lesson, break_lesson, drill) {
    this.initialize(screen, keytype, keymap, ruby, skip_lesson, break_lesson, drill);
  };
  KanaQuickHandler.prototype = (function() {
    var _p = KanaHandler;
    var p = new _p();
    p.backspace = function() {
      if (!this.inputTest()) return;
      if (this.screen.cursor.x < 1) return;
      var chr = this.drill.lines[this.drill_line].charAt(this.charPt);
      this.screen.write(chr);
      if (chr === ' ') {
        this.screen.write(chr);
        this.screen.move(null, this.screen.cursor.x - 1);
      }
      this.screen.move(null, this.screen.cursor.x - 2);

      this.charPt--;
      if (this.drill.lines[this.drill_line].charAt(this.charPt) === ' ') {
        this.charPt--;
        this.screen.move(null, this.screen.cursor.x - 1);
      }
    };
    p.err = function() {
      var err_char = this.drill.lines[this.drill_line].charAt(this.charPt);
      this.errors++;
      this.charPt++;
      this.screen.stand_out("STANDOUT");
      this.screen.write(err_char);
      if (err_char === ' ') {
        this.screen.write(err_char);
        this.charPt++;
      }
      this.screen.stand_end("STANDOUT");
      if (this.vbell) this.screen.vbell();
    };
    p.go_nextline = function() {
      if (this.ruby) this.drill_line++;
      this.charPt = 0;
      return this.screen.move(this.screen.cursor.y + (this.ruby ? 2 : 1), 0);
    };
    return p;
  })();

  var PromptHandler = function(screen) {
    this.initialize(screen);
  };
  PromptHandler.prototype = (function() {
    var p = new LineEditHandler();
    p.initialize = function(screen) {
      LineEditHandler.prototype.initialize.call(this, screen);
      this.submit = null;
      this.origin = {x: screen.cursor.x, y : screen.cursor.y};
    };
    p.ready = function(submit) {
      this.submit = submit;
      this.origin.x = this.screen.cursor.x;
      this.origin.y = this.screen.cursor.y;
    };
    p.backspace = function() {
      if (this.screen.cursor.x > this.origin.x)
        LineEditHandler.prototype.backspace.apply(this);
    };
    p.enter = function() {
      var buf = '';
      for (var i = this.origin.x; i < this.screen.cursor.x; i++)
        buf += this.screen.getc(i, this.origin.y);
      if (trim(buf).length > 0) this.submit(buf);
    };
    return p;
  })();

  return {
    screen : null,
    lesson : null,
    load : function(elem) {
      this.screen = new Typist.TScreen(elem);
      if (!this.screen) return;
      this.lesson = new Typist.Lesson();
      if (!this.lesson.ready) {
        this.screen.write('エラー: レッスンの情報が読み込めません.', 0, 0);
        this.screen.flush();
        return;
      }
      this.rcman = new Typist.RcManager();
      this.lesson.rc = this.rcman.load();
      this.set_frame_title(this.lesson.rc);
      this._inputHandlers.LineEditHandler = new LineEditHandler(this.screen);
      this._inputHandlers.prompt = new PromptHandler(this.screen);
      this._inputHandlers.info = new InfoHandler(this.screen);
      this._onUpdateSetting = [];
      this.loader = new Typist.DynamicLoader();
      this.ready = true;
    },
    get_lesson : function() {
      var lesson = this.lesson;
      var screen = this.screen;
      screen.clear();
      screen.move(0, 0);
      screen.write(lesson.get_lesson());
      screen.strictmode = true;
      this._inputHandler = this._inputHandlers.prompt;
      var main = this;
      this._inputHandler.ready(function(ret) {
        ret = trim(ret);
        if (ret == '?') ret = '?1';
        var l = lesson.check_lesson(ret);
        if (!l) {
          screen.move(screen.cursor.y + 2, 0);
          screen.clearLine();
          screen.write('"' + ret + '" というレッスンはありません.');
          main.wait_user(function() {
            main.get_lesson();
          });
        } else {
          main.give_lesson(l);
        }
      });
      screen.flush();
    },
    give_lesson : function(l, tries) {
      this.screen.strictmode = false;
      var me = this;
      var phase = undefined;
      if (l) {
        if ((l.course == 'k' || l.course == 'j' || l.course == '?')
          && this.loadkeymap(this.lesson.rc.keytype) === false) {
          this.screen.clear();
          this.screen.move(0, 0);
          this.screen.write('キーマップを読み込み中...');
          this.screen.flush();
          if (false === this.loader.load('js/' + this.lesson.rc.keytype + '_map.js', function() {
                me.give_lesson.call(me, l, tries);
              }, 600)) {
            this.screen.write('失敗しました');
            this.wait_user(function() {
              me.get_lesson();
            });
          }
          return;
        }
        if (this.lesson.find_lesson(l) === false) {
          this.screen.clear();
          this.screen.move(0, 0);
          this.screen.write('読み込み中...');
          this.screen.flush();
          if (false === this.loader.load(l.path, function() {
                me.give_lesson.call(me, l, tries);
              }, 600)) {
            this.screen.write('失敗しました');
            this.wait_user(function() {
              me.get_lesson();
            });
          }
          return;
        }
        phase = 0;
      }
      this.screen.clear();
      this.screen.flush();
      this.screen.move(0, 0);
      var run = isNumArg(tries) ? this.lesson.retry_lesson(this.screen)
        : this.lesson.give_lesson(this.screen, phase);
      if (run === true) {
        if (this.lesson.skip_lesson === false) {
          this.lesson.update_lesson();
          this.rcman.save(this.lesson.rc);
        }
        this.get_lesson();
        return;
      }

      var ruby = false;
      switch (run.kind) {
        case 'T':
        case 'B':
          this.wait_user(function () {
            me.give_lesson();
          });
          break;
        case 'D':
          this._inputHandler = new DrillHandler(this.screen, function() {
            me.lesson.skip_lesson = true;
            me.give_lesson();
          },
          function() {
            me.get_lesson();
          }, run);
          this._inputHandler.vbell = this.lesson.rc.vbell == '1';
          this._inputHandler.submit = function(errors) {
            me.wait_user(function (oncemore) {
              tries = isNumArg(tries) ? tries : 0;
              if (!oncemore && (tries >= 3 || errors <= tries)) me.give_lesson()
              else me.give_lesson(null, tries += 1);
            });
          };
          break;
        case 'P':
          this._inputHandler = new ParaHandler(this.screen, function() {
            me.lesson.skip_lesson = true;
            me.give_lesson();
          },
          function() {
            me.get_lesson();
          }, run);
          this._inputHandler.vbell = this.lesson.rc.vbell == '1';
          this._inputHandler.submit = function(errors) {
            me.wait_user(function (oncemore) {
              if (oncemore) me.give_lesson(null, 1)
              else me.give_lesson();
            });
          };
          break;
        case 'k':
          ruby = true;
        case 'K':
          this._inputHandler = new KanaHandler(this.screen, this.lesson.rc.keytype, this.keymap, ruby, function() {
            me.lesson.skip_lesson = true;
            me.give_lesson();
          },
          function() {
            me.get_lesson();
          }, run);
          this._inputHandler.vbell = this.lesson.rc.vbell == '1';
          this._inputHandler.submit = function(errors) {
            me.wait_user(function (oncemore) {
              tries = isNumArg(tries) ? tries : 0;
              if (!oncemore && (tries >= 3 || errors <= tries)) me.give_lesson()
              else me.give_lesson(null, tries += 1);
            });
          };
          break;
        case 'q':
          ruby = true;
        case 'Q':
          this._inputHandler = new KanaQuickHandler(this.screen, this.lesson.rc.keytype, this.keymap, ruby, function() {
            me.lesson.skip_lesson = true;
            me.give_lesson();
          },
          function() {
            me.get_lesson();
          }, run);
          this._inputHandler.vbell = this.lesson.rc.vbell == '1';
          this._inputHandler.submit = function(errors) {
            me.wait_user(function (oncemore) {
              if (oncemore) me.give_lesson(null, 1)
              else me.give_lesson();
            });
          };
          break;
        default:
          break;
      }
      this.screen.flush();
    },
    keydown : function(keyCode) {
      if (!this._inputHandler) return;
      var ret = this._inputHandler.keydown(keyCode);
      this.screen.flush();
      return ret;
    },
    keyup : function(keyCode) {
      if (!this._inputHandler) return;
      this._inputHandler.keyup(keyCode);
    },
    keypress : function(code) {
      if (!this._inputHandler) return;
      this._inputHandler.keypress(code);
      this.screen.flush();
    },
    set_frame_title : function(rc) {
      var title = 'typist: ';
      switch (rc.keytype) {
      case "j":
        title += 'jp106';
        break;
      case "e":
        title += 'us101';
        break;
      case "k":
        title += 'kokusan';
        break;
      default:
        break;
      }
      title += ' keyboard';
      title += rc.vbell == '1' ? ' [Visual Bell ON]' : '';
      this.screen.set_frame_title(title);
    },
    _defs : {
      misschar : 'X'
    },
    ready : false,
    _inputHandler : null,
    _inputHandlers : {},
    wait_user : function(submit) {
      this.screen.move(this.screen.rows - 1, 0);
      this.screen.stand_out("STANDOUT");
      this.screen.write("次に進むには何かキーを押して下さい...");
      this.screen.stand_end("STANDOUT");
      this.screen.flush();
      this._inputHandler = this._inputHandlers.info;
      var me = this;
      this._inputHandler.ctrls.l = function() {
        me.get_lesson();
      };
      this._inputHandler.submit = submit;
      this._inputHandler.ctrls.g = function() {
        me.setVbell.call(me);
      };
    },
    setVbell : function(v, quiet) {
      v = v !== undefined ? v : (this.lesson.rc.vbell == '1' ? '0' : '1');
      this.lesson.rc.vbell = v;
      this.rcman.save(this.lesson.rc);
      this.set_frame_title(this.lesson.rc);
      this._inputHandler.vbell = this.lesson.rc.vbell == '1';
      if (!quiet) {
        this.screen.move(0, 0);
        this.screen.stand_out("STANDOUT");
        this.screen.write(this.lesson.rc.vbell != '1' ? "[BELL OFF]" : "[BELL  ON]");
        this.screen.stand_end("STANDOUT");
        this.onUpdateSetting();
      }
    },
    setKeytype : function(keytype) {
      this.lesson.rc.keytype = keytype;
      this.rcman.save(this.lesson.rc);
      this.set_frame_title(this.lesson.rc);
    },
    _onUpdateSetting : [],
    addOnUpdateSetting : function(f) {
      this._onUpdateSetting.push(f);
    },
    onUpdateSetting : function() {
      for (var i = 0; i < this._onUpdateSetting.length; i++) {
        this._onUpdateSetting[i](this.lesson.rc);
      }
    },
    keymap : null,
    loadkeymap : function(keytype) {
      if (typeof Typist_keymap_data !== "object") return false;
      if (!Typist_keymap_data) return false;
      if (!(keytype in Typist_keymap_data)) return false;
      this.keymap = Typist_keymap_data[keytype];
      return true;
    },
    loader : null
  };
})();

// Dynamic Loader
var DynamicLoader = function() {
};
DynamicLoader.prototype = (function() {
  return {
    load : function(src, next, maxstat) {
      if (!(src in this.stats) || !this.stats[src]) {
        var script = document.createElement('script')
        script.src = src;
        script.type = "text/javascript";
        var head = document.getElementsByTagName('HEAD').item(0);
        head.appendChild(script);
        this.stats[src] = {'count' : 1, 'script' : script};
      } else {
        this.stats[src]['count'] += 1;
      }
      if (this.stats[src]['count'] > maxstat) {
        var head = document.getElementsByTagName('HEAD').item(0);
        head.removeChild(this.stats[src]['script']);
        this.stats[src] = null;
        return false;
      }
      setTimeout(next, 100);
      return true;
    },
    stats : {}
  };
})();

var RcManager = function() {
  this.rc = {};
};
RcManager.prototype = (function() {
  var decodekv = function(s) {
    var ret = {};
    var a = s.split(';');
    for (var i = 0; i < a.length; i++) {
      var kv = a[i].split('=');
      if (trim(kv[0]).length > 0) {
        ret[kv[0]] = kv[1] === undefined ? '' : trim(kv[1]);
        if (ret[kv[0]].indexOf(',') !== -1) {
          ret[kv[0]] = ret[kv[0]].split(',');
        }
      }
    }
    return ret;
  };
  return {
    load : function() {
      var c = (function(s, k) {
        var kv = decodekv(s);
        if (k in kv) return kv[k]
        else return null;
      })(document.cookie, 'typist_js_rc');
      if (c === null || c.length < 1) {
        this.make_rc();
      } else {
        c = decodeURIComponent(c);
        var data = decodekv(c);
        for (var i in data) {
          if (i == 'score' && data[i].constructor !== Array) data[i] = [data[i]];
          this.rc[i] = data[i];
        }
      }
      return this.rc;
    },
    save : function(rc) {
      if (rc === undefined) rc = this.rc;
      var tmp = [];
      for (var i in rc)
        tmp.push(i + '=' + (rc[i].constructor === Array ? rc[i].join(',') : rc[i]));
      var s = encodeURIComponent(tmp.join(';'));
      document.cookie =  'typist_js_rc=' + s + '; expires=Tue, 1-Jan-2030 00:00:00 GMT;';
    },
    make_rc : function() {
      this.rc.lang = 'ja';
      this.rc.keytype = 'j';
      this.rc.lastLesson = 't';
      this.rc.score = [];
      this.rc.vbell = '1';
      return this.rc;
    }
  };
})();

// libs
var spawn = function(o){
  var F = function(){};
  F.prototype = o;
  return new F;
};
var isNumArg = function(n) {
  return n !== undefined && !isNaN(parseInt(n));
};
var trim = function(s) {
  return s.replace(/^\s+|\s+$/g, "");
};

if (!this['Typist']) Typist = {
  TScreen : TScreen,
  Lesson : Lesson,
  Main : Main,
  DynamicLoader : DynamicLoader,
  RcManager : RcManager
};

})();
