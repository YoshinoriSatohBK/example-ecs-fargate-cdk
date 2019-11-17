#!/bin/sh

env=$1
if [ -z "$env" ]; then
  echo "env required"
  exit
fi

script_dir=$(cd $(dirname $0);pwd)
parameters=$(cat $script_dir/ssm-parameters-$env.json)
len=$(echo $parameters | jq length)
for i in $( seq 0 $(($len - 1)) ); do
  parameter=$(echo $parameters | jq .[$i])
  Name=$(echo $parameter | jq -r .Name)

  aws ssm delete-parameter --name $Name
done
