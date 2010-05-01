
use strict;

my %lessons;
my $buf = '';
my $key = '';
my $course = '';

while(<STDIN>) {
    if (/^\*(\w|\?)(\d+)\*$/) {
        $course = $1;
        $key = $1 . $2;
        next;
    }
    $key or next;
    $lessons{$key} .= $_;
}

my $dat = [];

foreach my $k (keys %lessons) {
    if ($lessons{$k} =~ /^#(if|lelse|elif|endif)/m) {
        my %ejk;
        foreach my $keytype ('e', 'j', 'k') {
            $ejk{$keytype} = makedata($k, $lessons{$k}, $keytype);
        }
        push(@{$dat}, $ejk{'e'});
        if (formatJson($ejk{'j'}{'data'}) eq formatJson($ejk{'k'}{'data'})) {
            $ejk{'j'}{'keytype'} = 'jk';
        } else {
            push(@{$dat}, $ejk{'k'});
        }
        push(@{$dat}, $ejk{'j'});
    } else {
        push(@{$dat}, makedata($k, $lessons{$k}, 'ejk'));
    }
}
print qq'if (!this["Typist_lesson_data"]) Typist_lesson_data = {};\n';
print 'Typist_lesson_data["' . lc($course) . '"] = ';
print formatJson($dat);
print ";\n";



sub makedata {
    my ($k, $l, $keytype) = @_;
    my $ret;
    $k = lc($k);
    $ret->{'course'} = substr($k, 0, 1);
    $ret->{'num'} = substr($k, 1);
    $ret->{'keytype'} = $keytype;

    my @tmplines = split "\n", $l;
    my $tmpdata = [];
    my $line_buf = [];
    my @conds;
    my $kind = '';
    foreach(@tmplines) {
        my $line = $_;
        chomp($line);
        if ($line =~ /^#(if|ifnot)\s+(\w+)$/) {
            if ('if' eq $1) {
                push(@conds, ($keytype eq $2 ? 1 : 0));
            } elsif ('ifnot' eq $1) {
                push(@conds, ($keytype ne $2 ? 1 : 0));
            }
            next;
        } elsif ($line =~ /^#else$/) {
            $conds[$#conds] = ($conds[$#conds] == 0 ? 1 : 0);
            next;
        } elsif ($line =~ /^#elif\s+(\w+)$/) {
            if ($conds[$#conds] == 1) {
                $conds[$#conds] += 1;
            } else {
                $conds[$#conds] = ($keytype eq $1 ? 1 : 0);
            }
            next;
        } elsif ($line =~ /^#endif/) {
            pop(@conds);
            next;
        }
        if (scalar(@conds) and $conds[$#conds] != 1) {
            next;
        }
        if ($line =~ /\\(\w)$/) {
            $kind = $1;
            $line = substr($line, 0, length($line) - 2);
        }
        push(@{$line_buf}, $line);
        if ($kind) {
            push(@{$tmpdata}, {'kind' => $kind, 'lines' => $line_buf});
            $line_buf = [];
            $kind = '';
        }
    }
    $ret->{'data'} = $tmpdata;
    return $ret;
}


sub formatJson {
    my($n) = @_;
    my $type = ref $n;
    if ($type eq 'ARRAY') {
        return '[' . (join ', ', map {formatJson($_)} @{$n}) . "]\n";
    } elsif ($type eq 'HASH') {
        return '{' . (join ', ', map {$_ . ':' . formatJson($n->{$_})} sort keys %{$n}) . "}\n";
    } else {
        return '"' . sanitize($n) . '"';
    }
}


sub sanitize {
    my($s) = @_;
    $s =~ s/\\/\\\\/g;
    $s =~ s/\"/\\"/g;
    $s =~ s/\t/        /g;
    return $s;
}
