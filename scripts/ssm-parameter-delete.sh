#!/bin/sh

parameters=$(cat ssm-parameters.json)
len=$(echo $parameters | jq length)
for i in $( seq 0 $(($len - 1)) ); do
  parameter=$(echo $parameters | jq .[$i])
  Name=$(echo $parameter | jq -r .Name)

  aws ssm delete-parameter --name $Name
done
